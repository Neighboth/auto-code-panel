"use server";

import { getTranslator } from "@/lib/i18n/server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { customers, storeAdmins } from "@/db/schema";
import { requireStoreAdmin } from "@/lib/tenant";
import { getCustomerSession, getStoreAdminSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { getMailPrefs, readUnsubscribeToken, setMailPrefs, type MailPreferenceUpdate } from "@/lib/mail-prefs";
import type { ActionResult } from "@/lib/types";

const KEYS = ["announcements", "delivery", "license", "security"] as const;

function patchFrom(formData: FormData): MailPreferenceUpdate {
  const patch: MailPreferenceUpdate = {};
  for (const key of KEYS) {
    patch[key] = formData.get(key) === "on" || formData.get(key) === "true";
  }
  return patch;
}

/** Customer profile → notification preferences. */
export async function saveCustomerMailPrefs(slug: string, formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const session = await getCustomerSession();
  if (!session) return { ok: false, message: t("x.oturum-bulunamad") };
  const rows = await db
    .select({ id: customers.id, storeId: customers.storeId, email: customers.email, username: customers.username })
    .from(customers)
    .where(eq(customers.id, session.customerId))
    .limit(1);
  const customer = rows[0];
  if (!customer || customer.storeId !== session.storeId) return { ok: false, message: t("x.hesap-bulunamad") };

  const patch = patchFrom(formData);
  const prefs = await setMailPrefs("customer", customer.id, patch, {
    email: customer.email,
    storeId: customer.storeId,
  });
  await logAudit({
    action: "mail.prefs.update",
    entity: "customer",
    entityId: customer.id,
    summaryKey: "x.user-e-posta-tercihlerini-guncelledi",
    summaryParams: { user: customer.username },
    storeId: customer.storeId,
    storeSlug: slug,
    actorType: "customer",
    actorId: customer.id,
    actorName: customer.username,
    metadata: prefs,
  });
  revalidatePath(`/${slug}/profil`);
  return { ok: true, message: t("x.bildirim-tercihleri-kaydedildi") };
}

/** Store panel → notification preferences of the signed-in manager. */
export async function saveStoreMailPrefs(slug: string, formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const session = await getStoreAdminSession();
  if (!session) return { ok: false, message: t("x.oturum-bulunamad") };
  const rows = await db
    .select({ id: storeAdmins.id, email: storeAdmins.email, username: storeAdmins.username })
    .from(storeAdmins)
    .where(eq(storeAdmins.id, session.adminId))
    .limit(1);
  const admin = rows[0];
  if (!admin) return { ok: false, message: t("x.yonetici-bulunamad") };

  const patch = patchFrom(formData);
  const prefs = await setMailPrefs("store_admin", admin.id, patch, {
    email: admin.email,
    storeId: guard.state.store.id,
  });
  await logAudit({
    action: "mail.prefs.update",
    entity: "store_admin",
    entityId: admin.id,
    summaryKey: "x.user-e-posta-tercihlerini-guncelledi",
    summaryParams: { user: admin.username },
    storeId: guard.state.store.id,
    storeSlug: slug,
    metadata: prefs,
  });
  revalidatePath(`/${slug}/admin/ayarlar`);
  return { ok: true, message: t("x.bildirim-tercihleri-kaydedildi") };
}

/** Public, token based: the link in the mail footer. Only the token's owner is touched. */
export async function unsubscribeByToken(
  token: string,
  scope: "announcements" | "all" = "announcements",
): Promise<ActionResult<{ email: string }>> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const resolved = readUnsubscribeToken(token);
  if (!resolved) return { ok: false, message: t("x.baglant-gecersiz-veya-suresi-dolmus") };
  const { audience, subjectId } = resolved;

  const rows =
    audience === "customer"
      ? await db.select({ email: customers.email }).from(customers).where(eq(customers.id, subjectId)).limit(1)
      : await db.select({ email: storeAdmins.email }).from(storeAdmins).where(eq(storeAdmins.id, subjectId)).limit(1);
  const email = rows[0]?.email ?? "";

  const patch: MailPreferenceUpdate =
    scope === "all"
      ? { announcements: false, delivery: false, license: false, security: false }
      : { announcements: false };
  const prefs = await setMailPrefs(audience, subjectId, patch, { email });

  await logAudit({
    action: "mail.prefs.unsubscribe",
    entity: audience,
    entityId: subjectId,
    summaryKey: "x.target-scope-kapatt",
    summaryParams: {
      target: email || t("x.adres"),
      scope: scope === "all" ? t("x.tum-e-posta-bildirimlerini") : t("x.duyuru-e-postalarn"),
    },
    severity: "warn",
    actorType: "system",
    actorName: "abonelik",
    metadata: { scope, prefs },
  });

  return { ok: true, message: t("x.tercihiniz-kaydedildi-bu-adrese-duyuru-e-postas-gonderil"), data: { email } };
}

/** Read-only helper used by the profile / settings UI. */
export async function currentMailPrefs(audience: "customer" | "store_admin", subjectId: number) {
  return getMailPrefs(audience, subjectId);
}
