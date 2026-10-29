import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, games } from "@/db/schema";
import { accountQuota, requireStoreAdmin } from "@/lib/tenant";
import { decryptData } from "@/lib/secret-crypto";
import { AccountManager, type AdminAccount } from "@/components/admin/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hesaplar" };

export default async function AdminAccountsPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) notFound();
  const store = guard.state.store;

  const accountRows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.storeId, store.id))
    .orderBy(desc(accounts.createdAt));

  const gameRows = await db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.storeId, store.id))
    .orderBy(games.title);

  const quota = await accountQuota(store);

  const list: AdminAccount[] = accountRows.map((account) => ({
    id: account.id,
    platform: account.platform,
    platformLabel: account.platformLabel,
    username: account.username,
    email: account.email,
    password: decryptData(account.password),
    productLabel: account.productLabel,
    linkedGameIds: account.linkedGameIds,
    guardType: account.guardType,
    hasSteamSecret: Boolean(account.steamSecret),
    hasTotpSecret: Boolean(account.totpSecret),
    mailEmail: account.mailEmail,
    mailPassword: account.mailPassword ? decryptData(account.mailPassword) : "",
    mailProvider: account.mailProvider,
    mailHost: account.mailHost,
    mailPort: account.mailPort,
    mailSenderFilter: account.mailSenderFilter,
    notes: account.notes,
    status: account.status,
  }));

  return (
    <AccountManager
      slug={store.slug}
      accounts={list}
      games={gameRows}
      quota={{ used: quota.used, max: quota.max, reached: quota.reached }}
    />
  );
}
