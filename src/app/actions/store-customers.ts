"use server";

import { currentLocaleCode } from "@/lib/i18n/server";
import { getTranslator } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translate";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { logAudit } from "@/lib/audit";
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
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };
  await db
    .update(customers)
    .set({ status: banned ? "banned" : "active" })
    .where(and(eq(customers.storeId, g.storeId), eq(customers.id, customerId)));
  refresh(g.slug);
  await logAudit({
    action: banned ? "store.customer.ban" : "store.customer.unban",
    entity: "customer",
    entityId: customerId,
    summaryKey: banned ? "x.user-yasakland" : "x.user-yasag-kaldrld",
    summaryParams: { user: customer.username },
    severity: banned ? "warn" : "info",
    storeId: g.storeId,
    storeSlug: g.slug,
  });
  return { ok: true, message: banned ? t("x.musteri-yasakland") : t("x.musterinin-yasag-kaldrld") };
}

export async function deleteCustomer(slug: string, customerId: number): Promise<ActionResult> {
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };

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
  await logAudit({
    action: "store.customer.delete",
    entity: "customer",
    entityId: customerId,
    summaryKey: "x.user-musterisi-ve-kutuphanesi-silindi",
    summaryParams: { user: customer.username },
    severity: "critical",
    storeId: g.storeId,
    storeSlug: g.slug,
    metadata: { username: customer.username, email: customer.email },
  });
  return { ok: true, message: t("x.musteri-ve-kutuphanesi-silindi") };
}

export async function editCustomer(slug: string, customerId: number, formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return { ok: false, message: t("x.kullanc-ad-3-24-karakter-olmaldr") };
  }
  if (username.toLowerCase() !== customer.username.toLowerCase()) {
    const taken = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.storeId, g.storeId), eq(customers.username, username)))
      .limit(1);
    if (taken.length > 0) return { ok: false, message: t("x.bu-kullanc-ad-bu-magazada-alnms") };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: t("x.gecerli-bir-e-posta-girin") };
  }
  if (newPassword && newPassword.length < 6) {
    return { ok: false, message: t("x.yeni-sifre-en-az-6-karakter-olmaldr") };
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
  await logAudit({
    action: "store.customer.update",
    entity: "customer",
    entityId: customerId,
    summaryKey: "x.user-musterisi-guncellendi",
    summaryParams: { user: customer.username },
    storeId: g.storeId,
    storeSlug: g.slug,
    metadata: {
      username,
      email,
      passwordChanged: Boolean(newPassword),
      before: { username: customer.username, email: customer.email },
    },
  });
  return { ok: true, message: t("x.musteri-bilgileri-guncellendi") };
}

export async function resetCustomerFactors(slug: string, customerId: number, kind: string): Promise<ActionResult> {
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };
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
  await logAudit({
    action: "store.customer.factor_reset",
    entity: "customer",
    entityId: customerId,
    summaryKey: "x.user-icin-kind-guvenlik-yontemi-sfrland",
    summaryParams: { user: customer.username, kind },
    severity: "warn",
    storeId: g.storeId,
    storeSlug: g.slug,
    metadata: { kind },
  });
  return { ok: true, message: t("x.guvenlik-yontemi-sfrland") };
}

export async function removeCustomerEntitlement(
  slug: string,
  entitlementId: number,
  customerId: number,
): Promise<ActionResult> {
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };
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
  if (rows.length === 0) return { ok: false, message: t("x.teslimat-bulunamad") };
  await db.delete(entitlements).where(and(eq(entitlements.id, entitlementId), eq(entitlements.storeId, g.storeId)));
  await sweepExpiredEntitlements(g.storeId);
  refresh(g.slug);
  await logAudit({
    action: "store.customer.entitlement_remove",
    entity: "entitlement",
    entityId: entitlementId,
    summaryKey: "x.user-kutuphanesinden-teslimat-kaldrld",
    summaryParams: { user: customer.username },
    severity: "warn",
    storeId: g.storeId,
    storeSlug: g.slug,
    metadata: { title: rows[0].title },
  });
  return { ok: true, message: t("x.teslimat-kutuphaneden-kaldrld") };
}

export async function addCustomerEntitlement(
  slug: string,
  customerId: number,
  gameId: number,
  durationMinutes: number | null,
): Promise<ActionResult> {
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };
  const game = await db.select().from(games).where(and(eq(games.storeId, g.storeId), eq(games.id, gameId))).limit(1);
  const gameRow = game[0];
  if (!gameRow) return { ok: false, message: t("x.urun-bulunamad") };

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
        guestUsername: t("x.yonetici-tarafndan-eklendi"),
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
  await logAudit({
    action: "store.customer.entitlement_add",
    entity: "customer",
    entityId: customerId,
    summaryKey: "x.user-kutuphanesine-title-eklendi",
    summaryParams: { user: customer.username, title: gameRow.title },
    storeId: g.storeId,
    storeSlug: g.slug,
    metadata: { gameId, gameTitle: gameRow.title, accountId: candidate?.id ?? null },
  });
  return {
    ok: true,
    message: candidate
      ? t("x.urun-kutuphaneye-eklendi-hesap-tanmland")
      : t("x.urun-kutuphaneye-eklendi-eslesen-hesap-bulunamad"),
  };
}

/**
 * Bulk customer actions used by the checkbox toolbar on the customers table.
 * Every branch is audited with the affected usernames.
 */
export async function bulkCustomerAction(
  slug: string,
  customerIds: number[],
  action: "ban" | "unban" | "delete",
): Promise<ActionResult<{ affected: number }>> {
  const { t } = await getTranslator();
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const unique = [...new Set(customerIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (unique.length === 0) return { ok: false, message: t("x.musteri-secilmedi") };

  const rows = await db
    .select({ id: customers.id, username: customers.username, status: customers.status })
    .from(customers)
    .where(and(eq(customers.storeId, g.storeId), inArray(customers.id, unique)));
  if (rows.length === 0) return { ok: false, message: t("x.musteri-bulunamad") };
  const ids = rows.map((row) => row.id);

  if (action === "delete") {
    await db.delete(entitlements).where(and(eq(entitlements.storeId, g.storeId), inArray(entitlements.customerId, ids)));
    await db
      .delete(securityFactors)
      .where(and(eq(securityFactors.subjectType, "customer"), inArray(securityFactors.subjectId, ids)));
    await db.delete(customers).where(and(eq(customers.storeId, g.storeId), inArray(customers.id, ids)));
    await sweepExpiredEntitlements(g.storeId);
  } else {
    await db
      .update(customers)
      .set({ status: action === "ban" ? "banned" : "active" })
      .where(and(eq(customers.storeId, g.storeId), inArray(customers.id, ids)));
  }

  refresh(g.slug);
  await logAudit({
    action: action === "delete" ? "store.customer.bulk_delete" : `store.customer.bulk_${action}`,
    entity: "customer",
    summaryKey: "x.count-musteri-icin-toplu-islem-action",
    summaryParams: {
      count: ids.length,
      action: action === "delete" ? t("x.silindi") : action === "ban" ? t("x.yasakland") : t("x.yasak-kaldrld"),
    },
    severity: action === "delete" ? "critical" : "warn",
    storeId: g.storeId,
    storeSlug: g.slug,
    metadata: { action, customers: rows.map((row) => row.username).slice(0, 50), count: ids.length },
  });

  return {
    ok: true,
    message:
      action === "delete"
        ? `${ids.length} müşteri silindi.`
        : action === "ban"
          ? `${ids.length} müşteri yasaklandı.`
          : `${ids.length} müşterinin yasağı kaldırıldı.`,
    data: { affected: ids.length },
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
  const t = createTranslator(await currentLocaleCode());
  const g = await guard(slug);
  if (!g) return { ok: false, message: t("x.yetkiniz-yok") };
  const customer = await loadCustomer(g.storeId, customerId);
  if (!customer) return { ok: false, message: t("x.musteri-bulunamad") };
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
