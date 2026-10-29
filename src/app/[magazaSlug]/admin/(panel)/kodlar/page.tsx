import { notFound } from "next/navigation";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, codes, customers, entitlements, games, redemptions } from "@/db/schema";
import { requireStoreAdmin } from "@/lib/tenant";
import { CodeManager, type AdminCode } from "@/components/admin/codes";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.kodlar") };
}

export default async function AdminCodesPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) notFound();
  const store = guard.state.store;

  const codeRows = await db
    .select()
    .from(codes)
    .where(eq(codes.storeId, store.id))
    .orderBy(desc(codes.createdAt))
    .limit(400);

  const redemptionRows = codeRows.length
    ? await db
        .select({
          redemption: redemptions,
          customerUsername: customers.username,
          expired: sql<number>`case when ${redemptions.accessExpiresAt} is not null and ${redemptions.accessExpiresAt} <= (unixepoch('now') * 1000) then 1 else 0 end`,
        })
        .from(redemptions)
        .leftJoin(customers, eq(customers.id, redemptions.customerId))
        .where(inArray(redemptions.codeId, codeRows.map((row) => row.id)))
    : [];

  const entitlementRows = redemptionRows.length
    ? await db
        .select()
        .from(entitlements)
        .where(inArray(entitlements.redemptionId, redemptionRows.map((row) => row.redemption.id)))
    : [];

  const gameRows = await db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.storeId, store.id))
    .orderBy(games.title);

  const accountRows = await db
    .select({ id: accounts.id, username: accounts.username, email: accounts.email, platformLabel: accounts.platformLabel })
    .from(accounts)
    .where(eq(accounts.storeId, store.id))
    .orderBy(desc(accounts.createdAt));

  const gameTitleById = new Map(gameRows.map((game) => [game.id, game.title]));
  const redemptionByCode = new Map(redemptionRows.map((row) => [row.redemption.codeId, row]));
  const itemsByRedemption = new Map<number, typeof entitlementRows>();
  for (const entitlement of entitlementRows) {
    const bucket = itemsByRedemption.get(entitlement.redemptionId) ?? [];
    bucket.push(entitlement);
    itemsByRedemption.set(entitlement.redemptionId, bucket);
  }

  const list: AdminCode[] = codeRows.map((code) => {
    const redemption = redemptionByCode.get(code.id);
    const accessExpiresAt = redemption?.redemption.accessExpiresAt ?? null;
    const status: AdminCode["status"] = !code.redeemedAt
      ? "active"
      : redemption?.expired
        ? "expired"
        : "used";

    const targetSummary =
      code.type === "choice"
        ? t("x.musteri-secimli-oyunlar")
        : [...code.gameIds.map((id) => gameTitleById.get(id)).filter(Boolean), ...code.accountIds.map((id) => `Hesap #${id}`)]
            .slice(0, 3)
            .join(", ");

    return {
      id: code.id,
      code: code.code,
      type: code.type as AdminCode["type"],
      label: code.label,
      durationMinutes: code.durationMinutes,
      choiceCount: code.choiceCount,
      createdAt: new Date(code.createdAt).toISOString(),
      redeemedAt: code.redeemedAt ? new Date(code.redeemedAt).toISOString() : null,
      status,
      targetSummary,
      detail: redemption
        ? {
            customerUsername: redemption.customerUsername ?? t("x.misafir-kullanc"),
            grantedAt: new Date(redemption.redemption.createdAt).toISOString(),
            accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt).toISOString() : null,
            items: (itemsByRedemption.get(redemption.redemption.id) ?? []).map((entitlement) => ({
              title: entitlement.title,
              kind: entitlement.kind,
              accountId: entitlement.accountId,
              gameId: entitlement.gameId,
            })),
          }
        : null,
    };
  });

  return (
    <CodeManager
      slug={store.slug}
      codes={list}
      games={gameRows}
      accounts={accountRows.map((account) => ({
        id: account.id,
        label: `${account.username ?? account.email ?? `Hesap #${account.id}`} · ${account.platformLabel}`,
      }))}
    />
  );
}
