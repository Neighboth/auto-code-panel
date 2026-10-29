import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, entitlements, games } from "@/db/schema";
import { getCustomerSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { getLocale } from "@/lib/i18n/server";
import { decryptData } from "@/lib/secret-crypto";
import { LibraryView, type LibraryItem } from "@/components/store/library-view";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.kutuphanem") };
}

export default async function LibraryPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const session = await getCustomerSession();
  if (!session || session.storeId !== state.store.id) {
    redirect(`${basePath}/giris`);
  }

  const rows = await db
    .select({ entitlement: entitlements, game: games, account: accounts })
    .from(entitlements)
    .leftJoin(games, eq(games.id, entitlements.gameId))
    .leftJoin(accounts, eq(accounts.id, entitlements.accountId))
    .where(
      and(
        eq(entitlements.storeId, state.store.id),
        eq(entitlements.customerId, session.customerId),
      ),
    )
    .orderBy(desc(entitlements.grantedAt));

  const items: LibraryItem[] = rows.map(({ entitlement, game, account }) => ({
    entitlementId: entitlement.id,
    title: entitlement.title || game?.title || account?.platformLabel || t("x.teslimat"),
    subtitle: account
      ? t("x.platform-hesab", { platform: account.platformLabel })
      : game
        ? t("x.oyun-erisimi")
        : "Dijital teslimat",
    coverImage: game?.coverImage ?? "",
    platformLabel: account?.platformLabel ?? "Steam",
    guardType: account?.guardType ?? "none",
    username: account?.username ?? null,
    email: account?.email ?? null,
    password: account ? decryptData(account.password) : null,
    mailEmail: account?.mailEmail ?? null,
    mailPassword: account?.mailPassword ? decryptData(account.mailPassword) : null,
    notes: account?.notes ?? "",
    expiresAt: entitlement.expiresAt ? new Date(entitlement.expiresAt).toISOString() : null,
  }));

  const locale = await getLocale();
  return <LibraryView slug={state.store.slug} basePath={basePath} items={items} locale={locale.code} />;
}
