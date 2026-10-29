"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureDatabase } from "@/db";
import {
  accounts,
  customers,
  entitlements,
  games,
  redemptions,
  securityFactors,
  stores,
} from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { decryptData } from "@/lib/secret-crypto";
import { getSuperSession } from "@/lib/session";
import {
  requireStoreAdmin,
  resolveStoreState,
  sweepExpiredEntitlements,
} from "@/lib/tenant";
import type { ActionResult } from "@/lib/types";

/** Store admins and the platform owner can manage tenant customers. */
async function guard(slug: string) {
  await ensureDatabase();
  const storeGuard = await requireStoreAdmin(slug);
  if (storeGuard) return { slug: storeGuard.state.store.slug, storeId: storeGuard.state.store.id };
  const superSession = await getSuperSession();
  if (!superSession) return null;
  const rows = await db.select().from(stores).where(eq(stores.slug, slug.toLowerCase())).limit(1);
  if (!rows[0]) return null;
  resolveStoreState(rows[0]);
  return { slug: rows[0].slug, storeId: rows[0].id };
}

function refresh(slug: string) {
  revalidatePath(`/${slug}/admin/kullanicilar`);
  revalidatePath("/super-admin/kullanicilar");
  revalidatePath(`/${slug}`, "layout");
}

async function loadCustomer(storeId: number, customerId: number) {
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, storeId), eq(customers.id, customerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setCustomerBan(slug: string, customerId: number, banned: boolean): Promise<ActionResult> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };
  await db
    .update(customers)
    .set({ status: banned ? "banned" : "active" })
    .where(and(eq(customers.storeId, g.storeId), eq(customers.id, customerId)));
  refresh(g.slug);
  return { ok: true, message: banned ? "Müşteri yasaklandı." : "Müşterinin yasağı kaldırıldı." };
}

export async function deleteCustomer(slug: string, customerId: number): Promise<ActionResult> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };

  await db
    .delete(entitlements)
    .where(and(eq(entitlements.storeId, g.storeId), eq(entitlements.customerId, customerId)));
  await db
    .delete(securityFactors)
    .where(and(eq(securityFactors.subjectType, "customer"), eq(securityFactors.subjectId, customerId)));
  await db
    .delete(customers)
    .where(and(eq(customers.storeId, g.storeId), eq(customers.id, customerId)));
  await sweepExpiredEntitlements(g.storeId);
  refresh(g.slug);
  return { ok: true, message: "Müşteri ve kütüphanesi silindi." };
}

export async function editCustomer(slug: string, customerId: number, formData: FormData): Promise<ActionResult> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return { ok: false, message: "Kullanıcı adı 3-24 karakter olmalıdır." };
  }
  if (username.toLowerCase() !== customer.username.toLowerCase()) {
    const taken = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.storeId, g.storeId), eq(customers.username, username)))
      .limit(1);
    if (taken.length > 0) return { ok: false, message: "Bu kullanıcı adı bu mağazada alınmış." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: "Geçerli bir e-posta girin." };
  }
  if (newPassword && newPassword.length < 6) {
    return { ok: false, message: "Yeni şifre en az 6 karakter olmalıdır." };
  }

  await db
    .update(customers)
    .set({
      username,
      displayName: displayName || username,
      email: email || null,
      passwordHash: newPassword ? hashPassword(newPassword) : customer.passwordHash,
    })
    .where(and(eq(customers.storeId, g.storeId), eq(customers.id, customerId)));
  refresh(g.slug);
  return { ok: true, message: "Müşteri bilgileri güncellendi." };
}

export async function resetCustomerFactors(slug: string, customerId: number, kind: string): Promise<ActionResult> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };
  await db
    .delete(securityFactors)
    .where(
      and(
        eq(securityFactors.subjectType, "customer"),
        eq(securityFactors.subjectId, customerId),
        eq(securityFactors.kind, kind),
      ),
    );
  refresh(g.slug);
  return { ok: true, message: "Güvenlik yöntemi sıfırlandı." };
}

export async function removeCustomerEntitlement(
  slug: string,
  entitlementId: number,
  customerId: number,
): Promise<ActionResult> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };
  const rows = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.storeId, g.storeId),
        eq(entitlements.customerId, customerId),
        eq(entitlements.id, entitlementId),
      ),
    )
    .limit(1);
  if (rows.length === 0) return { ok: false, message: "Teslimat bulunamadı." };
  await db.delete(entitlements).where(and(eq(entitlements.id, entitlementId), eq(entitlements.storeId, g.storeId)));
  await sweepExpiredEntitlements(g.storeId);
  refresh(g.slug);
  return { ok: true, message: "Teslimat kütüphaneden kaldırıldı." };
}

export async function addCustomerEntitlement(
  slug: string,
  customerId: number,
  gameId: number,
  durationMinutes: number | null,
): Promise<ActionResult> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };
  const game = await db.select().from(games).where(and(eq(games.storeId, g.storeId), eq(games.id, gameId))).limit(1);
  const gameRow = game[0];
  if (!gameRow) return { ok: false, message: "Ürün bulunamadı." };

  const candidates = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.storeId, g.storeId), sql`${accounts.status} <> 'retired'`));
  const candidate = candidates.find((account) => (account.linkedGameIds ?? []).includes(gameId));

  // Shared account model: no expiry, the customer keeps access forever.
  void durationMinutes;
  const expiresAt: Date | null = null;

  await db.transaction(async (tx) => {
    const [redemption] = await tx
      .insert(redemptions)
      .values({
        storeId: g.storeId,
        codeId: 0,
        customerId,
        guestUsername: "Yönetici tarafından eklendi",
        accessExpiresAt: expiresAt,
      })
      .returning();
    await tx.insert(entitlements).values({
      storeId: g.storeId,
      redemptionId: redemption.id,
      codeId: 0,
      customerId,
      kind: "game",
      gameId,
      accountId: candidate?.id ?? null,
      title: gameRow.title,
      expiresAt,
    });
  });
  refresh(g.slug);
  return {
    ok: true,
    message: candidate
      ? "Ürün kütüphaneye eklendi, hesap tanımlandı."
      : "Ürün kütüphaneye eklendi (eşleşen hesap bulunamadı).",
  };
}

/** Decrypted entitlement view used by the customer detail page. */
export async function customerLibraryPayload(
  slug: string,
  customerId: number,
): Promise<
  ActionResult<
    {
      title: string;
      kind: string;
      username: string | null;
      email: string | null;
      password: string | null;
      platformLabel: string;
      guardType: string;
      expiresAt: string | null;
      notes: string;
    }[]
  >
> {
  const g = await guard(slug);
  if (!g) return { ok: false, message: "Yetkiniz yok." };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };
  const rows = await db
    .select({ entitlement: entitlements, game: games, account: accounts })
    .from(entitlements)
    .leftJoin(games, eq(games.id, entitlements.gameId))
    .leftJoin(accounts, eq(accounts.id, entitlements.accountId))
    .where(and(eq(entitlements.storeId, g.storeId), eq(entitlements.customerId, customerId)))
    .orderBy(desc(entitlements.grantedAt));
  return {
    ok: true,
    data: rows.map(({ entitlement, game, account }) => ({
      title: entitlement.title || game?.title || "Teslimat",
      kind: entitlement.kind,
      username: account?.username ?? null,
      email: account?.email ?? null,
      password: account ? decryptData(account.password) : null,
      platformLabel: account?.platformLabel ?? "Steam",
      guardType: account?.guardType ?? "none",
      expiresAt: entitlement.expiresAt ? new Date(entitlement.expiresAt).toISOString() : null,
      notes: account?.notes ?? "",
    })),
  };
}
