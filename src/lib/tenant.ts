import { and, count, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, ensureDatabase } from "@/db";
import { accounts, customers, entitlements, platformSettings, storeAdmins, stores, type Store } from "@/db/schema";
import { normalizeHost, storeUsesHost } from "@/lib/domain";
import { env } from "@/lib/env";
import {
  getCustomerSession,
  getStoreAdminSession,
  type CustomerSession,
  type StoreAdminSession,
} from "@/lib/session";

export type StoreState = {
  store: Store;
  expired: boolean;
  suspended: boolean;
  active: boolean;
};

export function resolveStoreState(store: Store): StoreState {
  const expired = store.expiresAt !== null && new Date(store.expiresAt).getTime() <= Date.now();
  const suspended = store.status === "suspended";
  return { store, expired, suspended, active: !expired && !suspended };
}

export async function findStoreBySlug(slug: string): Promise<Store | null> {
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.slug, slug.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * URLs generated for a store stay under `/<slug>` by default. When the request
 * arrives on the store's verified custom domain, links are generated without
 * the prefix so the address bar stays clean (`magazadi.com/oyunlar`).
 */
export async function getStoreBasePath(
  store: Pick<Store, "slug" | "customDomain" | "customDomainVerifiedAt">,
): Promise<string> {
  if (!store.customDomain || !store.customDomainVerifiedAt) return `/${store.slug}`;
  const headerStore = await headers();
  const host = normalizeHost(
    headerStore.get("host") ?? headerStore.get("x-forwarded-host") ?? "",
  );
  return host && storeUsesHost(store, host) ? "" : `/${store.slug}`;
}

/** Resolves the store that owns an incoming Host header (verified custom domain). */
export async function findStoreByHost(host: string): Promise<Store | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(stores)
    .where(sql`lower(${stores.customDomain}) = ${normalized}`)
    .limit(1);
  const store = rows[0] ?? null;
  if (!store || !store.customDomainVerifiedAt) return null;
  return store;
}

export async function getStoreState(slug: string): Promise<StoreState | null> {
  const store = await findStoreBySlug(slug);
  if (!store) return null;
  return resolveStoreState(store);
}

export async function requireStoreAdmin(slug: string): Promise<{
  state: StoreState;
  session: StoreAdminSession;
} | null> {
  const session = await getStoreAdminSession();
  const state = await getStoreState(slug);
  if (!session || !state) return null;
  if (session.storeId !== state.store.id) return null;
  // Store managers are never suspended individually (only the whole store can be
  // suspended). We still verify the account exists to invalidate stale sessions.
  const adminRows = await db
    .select({ id: storeAdmins.id })
    .from(storeAdmins)
    .where(and(eq(storeAdmins.id, session.adminId), eq(storeAdmins.storeId, session.storeId)))
    .limit(1);
  if (!adminRows[0]) return null;
  return { state, session };
}

export async function requireCustomer(slug: string): Promise<{
  state: StoreState;
  session: CustomerSession;
} | null> {
  const session = await getCustomerSession();
  const state = await getStoreState(slug);
  if (!session || !state) return null;
  if (session.storeId !== state.store.id) return null;
  const customerRows = await db
    .select({ status: customers.status })
    .from(customers)
    .where(and(eq(customers.id, session.customerId), eq(customers.storeId, session.storeId)))
    .limit(1);
  if (!customerRows[0] || customerRows[0].status === "banned") return null;
  return { state, session };
}

export async function getPlatformSettings() {
  await ensureDatabase();
  const rows = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  return (
    rows[0] ?? {
      id: 1,
      brandName: env.brandName,
      renewalUrl: env.renewalUrl,
      supportEmail: env.supportEmail,
      defaultPlanNote: "",
      updatedAt: new Date(),
    }
  );
}

export async function countAccounts(storeId: number): Promise<number> {
  const rows = await db.select({ value: count() }).from(accounts).where(eq(accounts.storeId, storeId));
  return Number(rows[0]?.value ?? 0);
}

export async function accountQuota(store: Store): Promise<{
  used: number;
  max: number | null;
  remaining: number | null;
  reached: boolean;
}> {
  const used = await countAccounts(store.id);
  const max = store.maxAccounts;
  return {
    used,
    max,
    remaining: max === null ? null : Math.max(0, max - used),
    reached: max !== null && used >= max,
  };
}

function isLive(expiresAt: Date | null): boolean {
  return !expiresAt || new Date(expiresAt).getTime() > Date.now();
}

/** Frees inventory accounts whose delivery period has fully elapsed. */
export async function sweepExpiredEntitlements(storeId?: number): Promise<number> {
  const rows = await db
    .select({ accountId: entitlements.accountId, expiresAt: entitlements.expiresAt, storeId: entitlements.storeId })
    .from(entitlements);

  const relevant = storeId ? rows.filter((row) => row.storeId === storeId) : rows;
  const grouped = new Map<number, { live: boolean }>();
  for (const row of relevant) {
    if (!row.accountId) continue;
    const current = grouped.get(row.accountId) ?? { live: false };
    current.live = current.live || isLive(row.expiresAt);
    grouped.set(row.accountId, current);
  }

  let freed = 0;
  for (const [accountId, state] of grouped) {
    if (state.live) continue;
    const result = await db
      .update(accounts)
      .set({ status: "available", updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), eq(accounts.status, "assigned")))
      .returning({ id: accounts.id });
    freed += result.length;
  }
  return freed;
}
