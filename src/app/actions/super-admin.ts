"use server";

import { getTranslator } from "@/lib/i18n/server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureDatabase } from "@/db";
import { accounts, customers, plans, platformPosts, platformSettings, resellerKeys, storeAdmins, stores } from "@/db/schema";
import { generateResellerKey, hashPassword } from "@/lib/crypto";
import { revealPassword } from "@/lib/password-vault";
import { decryptData, encryptData } from "@/lib/secret-crypto";
import { getSuperSession } from "@/lib/session";
import { env } from "@/lib/env";
import { managerIdentifierError } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit";
import { sendAnnouncementMails, sendLicenseReminders } from "@/lib/mail-events";
import type { ActionResult } from "@/lib/types";

export type StoreAccountView = {
  id: number;
  username: string | null;
  email: string | null;
  platformLabel: string;
  password: string;
  steamSecret: string;
  totpSecret: string;
  guardType: string;
  status: string;
};

/** Platform owner only: decrypts inventory credentials for the selected tenant. */
export async function viewStoreAccounts(storeId: number): Promise<ActionResult<StoreAccountView[]>> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const storeRows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (storeRows.length === 0) return { ok: false, message: t("x.magaza-bulunamad-2") };
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.storeId, storeId));

  await logAudit({
    action: "super.accounts.reveal",
    entity: "store",
    entityId: storeId,
    summaryKey: "x.store-magazasnn-count-hesabnn-sifreleri-goruntulendi",
    summaryParams: { store: storeRows[0].name, count: rows.length },
    severity: "warn",
    storeId,
    storeSlug: storeRows[0].slug,
    metadata: { accounts: rows.map((row) => row.id) },
  });
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      platformLabel: row.platformLabel,
      password: decryptData(row.password),
      steamSecret: row.steamSecret ? decryptData(row.steamSecret) : "",
      totpSecret: row.totpSecret ? decryptData(row.totpSecret) : "",
      guardType: row.guardType,
      status: row.status,
    })),
  };
}

async function guard() {
  await ensureDatabase();
  const session = await getSuperSession();
  return session !== null;
}

export type ResellerKeyPayload = {
  durationDays: number | null;
  maxAccounts: number | null;
  renewalUrl: string;
  note: string;
  count: number;
};

export async function createResellerKeys(
  payload: ResellerKeyPayload,
): Promise<ActionResult<{ codes: string[] }>> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };

  const count = Math.min(50, Math.max(1, Math.trunc(payload.count || 1)));
  const durationDays =
    payload.durationDays === null ? null : Math.max(1, Math.trunc(payload.durationDays));
  const maxAccounts =
    payload.maxAccounts === null ? null : Math.max(1, Math.trunc(payload.maxAccounts));
  const renewalUrl = payload.renewalUrl.trim();

  if (renewalUrl && !/^https?:\/\//i.test(renewalUrl)) {
    return { ok: false, message: t("x.sure-uzatma-linki-http-s-ile-baslamaldr") };
  }

  const values = Array.from({ length: count }, () => ({
    code: generateResellerKey(),
    durationDays,
    maxAccounts,
    renewalUrl: renewalUrl || null,
    note: payload.note.slice(0, 160),
    status: "available",
  }));

  const inserted = await db.insert(resellerKeys).values(values).returning({ code: resellerKeys.code });
  await logAudit({
    action: "super.reseller_keys.create",
    entity: "reseller_key",
    summaryKey: "x.count-bayilik-kodu-olusturuldu-2",
    summaryParams: { count: inserted.length },
    metadata: {
      count: inserted.length,
      durationDays,
      maxAccounts,
      renewalUrl: renewalUrl || null,
      note: payload.note.slice(0, 160),
    },
  });
  revalidatePath("/super-admin");
  return {
    ok: true,
    message: t("x.count-bayilik-kodu-olusturuldu", { count: inserted.length }),
    data: { codes: inserted.map((row) => row.code) },
  };
}

export async function revokeResellerKey(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: t("x.gecersiz-kod") };
  const rows = await db.select().from(resellerKeys).where(eq(resellerKeys.id, id)).limit(1);
  const key = rows[0];
  if (!key) return { ok: false, message: t("x.kod-bulunamad") };
  if (key.status === "used") {
    return { ok: false, message: t("x.kullanlms-kod-iptal-edilemez-bayiyi-askya-alabilirsiniz") };
  }
  await db.update(resellerKeys).set({ status: "revoked" }).where(eq(resellerKeys.id, id));
  await logAudit({
    action: "super.reseller_keys.revoke",
    entity: "reseller_key",
    entityId: id,
    summaryKey: "x.code-bayilik-kodu-iptal-edildi",
    summaryParams: { code: key.code },
    severity: "warn",
    metadata: { code: key.code, note: key.note },
  });
  revalidatePath("/super-admin");
  return { ok: true, message: t("x.bayilik-kodu-iptal-edildi-2") };
}

export async function extendStoreLicense(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const storeId = Number(formData.get("storeId"));
  const daysRaw = String(formData.get("days") ?? "").trim();
  const maxAccountsRaw = String(formData.get("maxAccounts") ?? "").trim();
  const renewalUrl = String(formData.get("renewalUrl") ?? "").trim();

  if (!Number.isInteger(storeId)) return { ok: false, message: t("x.magaza-bulunamad-2") };
  const rows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = rows[0];
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };

  if (daysRaw !== "" && daysRaw !== "0") {
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days <= 0) return { ok: false, message: t("x.gecerli-bir-gun-says-girin") };
    const base =
      store.expiresAt && new Date(store.expiresAt).getTime() > Date.now()
        ? new Date(store.expiresAt).getTime()
        : Date.now();
    await db
      .update(stores)
      .set({ expiresAt: new Date(base + days * 86_400_000), status: "active", updatedAt: new Date() })
      .where(eq(stores.id, store.id));
  }

  if (maxAccountsRaw !== "") {
    const maxAccounts = maxAccountsRaw === "unlimited" ? null : Number(maxAccountsRaw);
    if (maxAccounts !== null && (!Number.isFinite(maxAccounts) || maxAccounts < 1)) {
      return { ok: false, message: t("x.hesap-limiti-gecersiz") };
    }
    await db.update(stores).set({ maxAccounts, updatedAt: new Date() }).where(eq(stores.id, store.id));
  }

  if (renewalUrl) {
    if (!/^https?:\/\//i.test(renewalUrl)) {
      return { ok: false, message: t("x.sure-uzatma-linki-http-s-ile-baslamaldr") };
    }
    await db.update(stores).set({ renewalUrl, updatedAt: new Date() }).where(eq(stores.id, store.id));
  }

  const refreshed = await db.select().from(stores).where(eq(stores.id, store.id)).limit(1);
  if (refreshed[0]?.expiresAt && new Date(refreshed[0].expiresAt).getTime() <= Date.now()) {
    return { ok: false, message: t("x.sure-eklendi-ancak-lisans-hala-gecmis-tarihte-daha-fazla") };
  }

  await logAudit({
    action: "super.store.extend",
    entity: "store",
    entityId: store.id,
    summaryKey: "x.store-lisans-guncellendi-days-gun-limit-limit",
    summaryParams: {
      store: store.name,
      days: daysRaw || "0",
      limit: maxAccountsRaw || t("x.degismedi"),
    },
    severity: "info",
    storeId: store.id,
    storeSlug: store.slug,
    metadata: {
      days: daysRaw,
      maxAccounts: maxAccountsRaw,
      renewalUrl: renewalUrl || null,
      expiresAt: refreshed[0]?.expiresAt ?? null,
    },
  });
  revalidatePath("/super-admin");
  revalidatePath(`/${store.slug}`, "layout");
  return { ok: true, message: t("x.bayi-lisans-guncellendi") };
}

/**
 * Store managers are intentionally NOT individually suspendable: the store is
 * the licensing unit. Suspending a manager used to lock the account out of the
 * panel and produced an infinite redirect loop. Only `setStoreSuspension` exists.
 */
export async function getStoreSuspensionInfo(storeId: number): Promise<ActionResult<{ suspended: boolean }>> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const rows = await db.select({ status: stores.status }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!rows[0]) return { ok: false, message: t("x.magaza-bulunamad-2") };
  return { ok: true, data: { suspended: rows[0].status === "suspended" } };
}

export async function setStoreSuspension(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const storeId = Number(formData.get("storeId"));
  const suspended = String(formData.get("suspended")) === "true";
  if (!Number.isInteger(storeId)) return { ok: false, message: t("x.magaza-bulunamad-2") };

  const rows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = rows[0];
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };

  await db
    .update(stores)
    .set({ status: suspended ? "suspended" : "active", updatedAt: new Date() })
    .where(eq(stores.id, store.id));

  await logAudit({
    action: suspended ? "super.store.suspend" : "super.store.resume",
    entity: "store",
    entityId: store.id,
    summaryKey: suspended ? "x.store-magazas-askya-alnd" : "x.store-magazas-yeniden-aktiflestirildi",
    summaryParams: { store: store.name },
    severity: suspended ? "warn" : "info",
    storeId: store.id,
    storeSlug: store.slug,
  });

  revalidatePath("/super-admin");
  revalidatePath(`/${store.slug}`, "layout");
  return { ok: true, message: suspended ? t("x.bayi-askya-alnd") : t("x.bayi-yeniden-aktiflestirildi") };
}

/* ------------------------- Duyuru & güncelleme ------------------------ */

export async function savePlatformPost(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };

  const idRaw = String(formData.get("id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "announcement") === "update" ? "update" : "announcement";
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const version = String(formData.get("version") ?? "").trim();
  const pinned = formData.get("pinned") === "on" || formData.get("pinned") === "true";

  if (title.length < 3) return { ok: false, message: t("x.baslk-en-az-3-karakter-olmaldr") };
  if (title.length > 120) return { ok: false, message: t("x.baslk-en-fazla-120-karakter-olabilir") };
  if (body.length > 8000) return { ok: false, message: t("x.icerik-en-fazla-8000-karakter-olabilir") };
  if (version.length > 24) return { ok: false, message: t("x.surum-etiketi-en-fazla-24-karakter-olabilir") };

  const values = {
    kind,
    title,
    body,
    version: kind === "update" ? version : "",
    pinned,
    updatedAt: new Date(),
  };

  if (idRaw) {
    const id = Number(idRaw);
    if (!Number.isInteger(id)) return { ok: false, message: t("x.gecersiz-kayt") };
    const updated = await db
      .update(platformPosts)
      .set(values)
      .where(eq(platformPosts.id, id))
      .returning({ id: platformPosts.id });
    if (updated.length === 0) return { ok: false, message: t("x.kayt-bulunamad") };
    await logAudit({
      action: "super.post.update",
      entity: "platform_post",
      entityId: id,
      summaryKey: kind === "update" ? "x.guncelleme-duzenlendi-title" : "x.duyuru-duzenlendi-title",
      summaryParams: { title },
      metadata: { kind, version, pinned },
    });
    revalidatePath("/super-admin");
    revalidatePath("/super-admin/duyurular");
    return { ok: true, message: t("x.kayt-guncellendi"), data: { id: updated[0].id } };
  }

  const [created] = await db
    .insert(platformPosts)
    .values({ ...values, publishedAt: new Date() })
    .returning();

  await logAudit({
    action: "super.post.create",
    entity: "platform_post",
    entityId: created.id,
    summaryKey: kind === "update" ? "x.guncelleme-yaynland-title" : "x.duyuru-yaynland-title",
    summaryParams: { title },
    metadata: { kind, version, pinned, bodyLength: body.length },
  });

  // Broadcast to every ACTIVE store manager; suspended/expired stores are skipped.
  const broadcast = await sendAnnouncementMails(created).catch((err) => {
    console.error("[post] announcement mails failed", err);
    return { sent: 0, skipped: 0 };
  });

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/duyurular");
  return {
    ok: true,
    message: t(kind === "update" ? "x.guncelleme-notu-yaynland-count-magazaya-e-posta-gonderil" : "x.duyuru-yaynland-count-magazaya-e-posta-gonderildi", { count: broadcast.sent }),
    data: { id: created.id },
  };
}

export async function deletePlatformPost(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: t("x.gecersiz-kayt") };
  const removed = await db.select().from(platformPosts).where(eq(platformPosts.id, id)).limit(1);
  await db.delete(platformPosts).where(eq(platformPosts.id, id));
  await logAudit({
    action: "super.post.delete",
    entity: "platform_post",
    entityId: id,
    summaryKey: "x.duyuru-silindi-title",
    summaryParams: { title: removed[0]?.title ?? id },
    severity: "warn",
    metadata: { kind: removed[0]?.kind ?? null },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/duyurular");
  return { ok: true, message: t("x.kayt-silindi") };
}

export async function setPlatformPostPinned(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = Number(formData.get("id"));
  const pinned = String(formData.get("pinned")) === "true";
  if (!Number.isInteger(id)) return { ok: false, message: t("x.gecersiz-kayt") };
  await db.update(platformPosts).set({ pinned, updatedAt: new Date() }).where(eq(platformPosts.id, id));
  await logAudit({
    action: "super.post.pin",
    entity: "platform_post",
    entityId: id,
    summaryKey: pinned ? "x.duyuru-sabitlendi" : "x.sabitleme-kaldrld",
    metadata: { pinned },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/duyurular");
  return { ok: true, message: pinned ? t("x.kayt-sabitlendi") : t("x.sabitleme-kaldrld-2") };
}

/**
 * Renewal link and support e-mail come from environment variables
 * (`RENEWAL_URL`, `SUPPORT_EMAIL`) and are intentionally not editable from the
 * dashboard: a compromised super-admin session must not be able to redirect
 * payment flows.
 */
export async function updatePlatformSettings(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const defaultPlanNote = String(formData.get("defaultPlanNote") ?? "").trim();
  if (defaultPlanNote.length > 2000) {
    return { ok: false, message: "Bilgilendirme metni en fazla 2000 karakter olabilir." };
  }

  await db
    .insert(platformSettings)
    .values({
      id: 1,
      renewalUrl: env.renewalUrl,
      supportEmail: env.supportEmail,
      defaultPlanNote,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { renewalUrl: env.renewalUrl, supportEmail: env.supportEmail, defaultPlanNote, updatedAt: new Date() },
    });

  await logAudit({
    action: "super.settings.update",
    entity: "platform_settings",
    entityId: 1,
    summaryKey: "x.sistem-ayarlar-guncellendi",
    metadata: { defaultPlanNoteLength: defaultPlanNote.length },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/ayarlar");
  revalidatePath("/", "layout");
  return { ok: true, message: t("x.sistem-ayarlar-kaydedildi-sure-uzatma-linki-ve-destek-e") };
}

/* --------------------------------------------------------------- pricing */

const PLAN_LOCALE_RE = /^[a-z]{2,3}$/;

/**
 * Creates or updates a pricing tier.
 *
 * Everything the marketing page shows is editable here: price + currency,
 * duration, account limit, feature bullets, an optional purchase link and — via
 * the `translations` field — per-language overrides. `translations` arrives as
 * JSON text from the editor: `{ "en": { "name": "...", "features": ["…"] } }`.
 */
export async function savePlan(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };

  const id = Number(formData.get("id") ?? 0) || null;
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const description = String(formData.get("description") ?? "").trim().slice(0, 280);
  const price = String(formData.get("price") ?? "").trim().replace(",", ".").slice(0, 20);
  const currency = String(formData.get("currency") ?? "TRY").trim().toUpperCase().slice(0, 3);
  const durationRaw = String(formData.get("durationDays") ?? "").trim();
  const limitRaw = String(formData.get("accountLimit") ?? "").trim();
  const purchaseUrl = String(formData.get("purchaseUrl") ?? "").trim().slice(0, 500);
  const highlight = formData.get("highlight") === "on" || formData.get("highlight") === "true";
  const active = formData.get("active") !== "false";
  const sortOrder = Math.trunc(Number(formData.get("sortOrder") ?? 0) || 0);
  const features = String(formData.get("features") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const translationsRaw = String(formData.get("translations") ?? "").trim();

  if (!name) return { ok: false, message: t("x.paket-adi-zorunludur") };
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(price)) return { ok: false, message: t("x.gecersiz-fiyat") };
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: t("x.gecersiz-para-birimi") };
  if (purchaseUrl && !/^(https?:\/\/|\/)/i.test(purchaseUrl)) {
    return { ok: false, message: t("x.satin-alma-linki-http-s-veya-ile-baslamaldr") };
  }

  let translations: Record<string, { name?: string; description?: string; features?: string[] }> = {};
  if (translationsRaw) {
    try {
      const parsed = JSON.parse(translationsRaw) as Record<string, unknown>;
      for (const [locale, value] of Object.entries(parsed)) {
        if (!PLAN_LOCALE_RE.test(locale) || !value || typeof value !== "object") continue;
        const entry = value as { name?: unknown; description?: unknown; features?: unknown };
        translations[locale] = {
          name: typeof entry.name === "string" ? entry.name.slice(0, 80) : undefined,
          description: typeof entry.description === "string" ? entry.description.slice(0, 280) : undefined,
          features: Array.isArray(entry.features)
            ? entry.features.filter((item): item is string => typeof item === "string").slice(0, 12)
            : undefined,
        };
      }
    } catch {
      return { ok: false, message: t("x.ceviri-verisi-gecersiz-json") };
    }
  }

  const durationDays = durationRaw === "" || durationRaw === "unlimited" ? null : Math.trunc(Number(durationRaw));
  if (durationDays !== null && (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 3650)) {
    return { ok: false, message: t("x.gun-sayisi-gecersiz") };
  }
  const accountLimit = limitRaw === "" || limitRaw === "unlimited" ? null : Math.trunc(Number(limitRaw));
  if (accountLimit !== null && (!Number.isFinite(accountLimit) || accountLimit < 1)) {
    return { ok: false, message: t("x.hesap-limiti-gecersiz") };
  }

  const payload = {
    name,
    description,
    price: Number(price).toFixed(2),
    currency,
    durationDays,
    accountLimit,
    features,
    purchaseUrl,
    highlight,
    active,
    sortOrder,
    translations,
    updatedAt: new Date(),
  };

  if (id) {
    const updated = await db.update(plans).set(payload).where(eq(plans.id, id)).returning({ id: plans.id });
    if (updated.length === 0) return { ok: false, message: t("x.paket-bulunamad") };
    revalidatePath("/");
    revalidatePath("/super-admin/fiyatlar");
    await logAudit({
      action: "super.plan.update",
      entity: "plan",
      entityId: String(id),
      summaryKey: "x.paket-guncellendi-name",
      summaryParams: { name },
      metadata: { name, price: payload.price, currency, active },
    });
    return { ok: true, message: t("x.paket-guncellendi"), data: { id } };
  }

  const [created] = await db.insert(plans).values(payload).returning({ id: plans.id });
  revalidatePath("/");
  revalidatePath("/super-admin/fiyatlar");
  await logAudit({
    action: "super.plan.create",
    entity: "plan",
    entityId: String(created.id),
    summaryKey: "x.paket-eklendi-name",
    summaryParams: { name },
    metadata: { name, price: payload.price, currency },
  });
  return { ok: true, message: t("x.paket-eklendi"), data: { id: created.id } };
}

export async function deletePlan(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = Number(formData.get("id") ?? 0);
  if (!id) return { ok: false, message: t("x.paket-bulunamad") };
  await db.delete(plans).where(eq(plans.id, id));
  revalidatePath("/");
  revalidatePath("/super-admin/fiyatlar");
  await logAudit({
    action: "super.plan.delete",
    entity: "plan",
    entityId: String(id),
    summaryKey: "x.paket-silindi",
    metadata: { id },
  });
  return { ok: true, message: t("x.paket-silindi") };
}

/* ------------------------------------------------------------ credentials */

export type LoginView = {
  kind: "admin" | "customer";
  id: number;
  username: string;
  email: string;
  status: string;
  /** Decrypted recovery copy, or null for accounts created before the vault. */
  password: string | null;
};

/**
 * Platform owner only: store manager and customer passwords for one store.
 *
 * These are the recovery copies written by `rememberPassword` (AES-256-GCM).
 * Accounts that predate the vault return `password: null` and the panel offers
 * "set a new password" instead — a bcrypt hash genuinely cannot be reversed.
 */
export async function viewStoreLogins(storeId: number): Promise<ActionResult<LoginView[]>> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const adminRows = await db
    .select()
    .from(storeAdmins)
    .where(eq(storeAdmins.storeId, storeId));
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.storeId, storeId));
  const rows: LoginView[] = [
    ...adminRows.map((row) => ({
      kind: "admin" as const,
      id: row.id,
      username: row.username,
      email: row.email,
      status: row.status,
      password: revealPassword(row.passwordEnc),
    })),
    ...customerRows.map((row) => ({
      kind: "customer" as const,
      id: row.id,
      username: row.username,
      email: row.email ?? "",
      status: row.status,
      password: revealPassword(row.passwordEnc),
    })),
  ];
  await logAudit({
    action: "super.logins.view",
    entity: "store",
    entityId: String(storeId),
    summaryKey: "x.count-hesap-sifresi-goruntulendi",
    summaryParams: { count: rows.length },
    storeId,
    metadata: { admins: adminRows.length, customers: customerRows.length },
  });
  return { ok: true, message: "", data: rows };
}

/**
 * Sets a new password for a store manager or customer.
 *
 * Used both to reset a forgotten password and to replace one that never had a
 * recovery copy. The hash is updated for sign-in and the vault keeps the
 * readable copy so the owner can be told the new password later.
 */
export async function setStoreLoginPassword(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  if (!(await guard())) return { ok: false, message: t("x.yetkiniz-yok") };
  const kind = String(formData.get("kind") ?? "admin") === "customer" ? "customer" : "admin";
  const id = Number(formData.get("id") ?? 0);
  const password = String(formData.get("password") ?? "");
  if (!id) return { ok: false, message: t("x.hesap-bulunamad") };
  if (password.length < 8) return { ok: false, message: t("x.sifre-en-az-8-karakter-olmaldr") };

  const hash = hashPassword(password);
  const enc = encryptData(password);

  if (kind === "admin") {
    const [row] = await db
      .update(storeAdmins)
      .set({ passwordHash: hash, passwordEnc: enc })
      .where(eq(storeAdmins.id, id))
      .returning({ id: storeAdmins.id, storeId: storeAdmins.storeId, username: storeAdmins.username });
    if (!row) return { ok: false, message: t("x.yonetici-bulunamad") };
    await logAudit({
      action: "super.login.password",
      entity: "store_admin",
      entityId: String(row.id),
      summaryKey: "x.yonetici-sifresi-guncellendi-user",
      summaryParams: { user: row.username },
      storeId: row.storeId,
      severity: "warn",
    });
    return { ok: true, message: t("x.sifre-guncellendi") };
  }

  const [row] = await db
    .update(customers)
    .set({ passwordHash: hash, passwordEnc: enc })
    .where(eq(customers.id, id))
    .returning({ id: customers.id, storeId: customers.storeId, username: customers.username });
  if (!row) return { ok: false, message: t("x.hesap-bulunamad") };
  await logAudit({
    action: "super.login.password",
    entity: "customer",
    entityId: String(row.id),
    summaryKey: "x.musteri-sifresi-guncellendi-user",
    summaryParams: { user: row.username },
    storeId: row.storeId,
    severity: "warn",
  });
  return { ok: true, message: t("x.sifre-guncellendi") };
}
