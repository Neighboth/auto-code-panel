"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureDatabase } from "@/db";
import { accounts, platformPosts, platformSettings, resellerKeys, storeAdmins, stores } from "@/db/schema";
import { generateResellerKey } from "@/lib/crypto";
import { decryptData } from "@/lib/secret-crypto";
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
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const storeRows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (storeRows.length === 0) return { ok: false, message: "Mağaza bulunamadı." };
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.storeId, storeId));

  await logAudit({
    action: "super.accounts.reveal",
    entity: "store",
    entityId: storeId,
    summary: `${storeRows[0].name} mağazasının ${rows.length} hesabının şifreleri görüntülendi`,
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
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };

  const count = Math.min(50, Math.max(1, Math.trunc(payload.count || 1)));
  const durationDays =
    payload.durationDays === null ? null : Math.max(1, Math.trunc(payload.durationDays));
  const maxAccounts =
    payload.maxAccounts === null ? null : Math.max(1, Math.trunc(payload.maxAccounts));
  const renewalUrl = payload.renewalUrl.trim();

  if (renewalUrl && !/^https?:\/\//i.test(renewalUrl)) {
    return { ok: false, message: "Süre uzatma linki http(s) ile başlamalıdır." };
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
    summary: `${inserted.length} bayilik kodu oluşturuldu`,
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
    message: `${inserted.length} bayilik kodu oluşturuldu.`,
    data: { codes: inserted.map((row) => row.code) },
  };
}

export async function revokeResellerKey(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "Geçersiz kod." };
  const rows = await db.select().from(resellerKeys).where(eq(resellerKeys.id, id)).limit(1);
  const key = rows[0];
  if (!key) return { ok: false, message: "Kod bulunamadı." };
  if (key.status === "used") {
    return { ok: false, message: "Kullanılmış kod iptal edilemez. Bayiyi askıya alabilirsiniz." };
  }
  await db.update(resellerKeys).set({ status: "revoked" }).where(eq(resellerKeys.id, id));
  await logAudit({
    action: "super.reseller_keys.revoke",
    entity: "reseller_key",
    entityId: id,
    summary: `${key.code} bayilik kodu iptal edildi`,
    severity: "warn",
    metadata: { code: key.code, note: key.note },
  });
  revalidatePath("/super-admin");
  return { ok: true, message: "Bayilik kodu iptal edildi." };
}

export async function extendStoreLicense(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const storeId = Number(formData.get("storeId"));
  const daysRaw = String(formData.get("days") ?? "").trim();
  const maxAccountsRaw = String(formData.get("maxAccounts") ?? "").trim();
  const renewalUrl = String(formData.get("renewalUrl") ?? "").trim();

  if (!Number.isInteger(storeId)) return { ok: false, message: "Mağaza bulunamadı." };
  const rows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = rows[0];
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };

  if (daysRaw !== "" && daysRaw !== "0") {
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days <= 0) return { ok: false, message: "Geçerli bir gün sayısı girin." };
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
      return { ok: false, message: "Hesap limiti geçersiz." };
    }
    await db.update(stores).set({ maxAccounts, updatedAt: new Date() }).where(eq(stores.id, store.id));
  }

  if (renewalUrl) {
    if (!/^https?:\/\//i.test(renewalUrl)) {
      return { ok: false, message: "Süre uzatma linki http(s) ile başlamalıdır." };
    }
    await db.update(stores).set({ renewalUrl, updatedAt: new Date() }).where(eq(stores.id, store.id));
  }

  const refreshed = await db.select().from(stores).where(eq(stores.id, store.id)).limit(1);
  if (refreshed[0]?.expiresAt && new Date(refreshed[0].expiresAt).getTime() <= Date.now()) {
    return { ok: false, message: "Süre eklendi ancak lisans hâlâ geçmiş tarihte. Daha fazla gün ekleyin." };
  }

  await logAudit({
    action: "super.store.extend",
    entity: "store",
    entityId: store.id,
    summary: `${store.name} lisansı güncellendi (${daysRaw || "0"} gün, limit: ${maxAccountsRaw || "değişmedi"})`,
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
  return { ok: true, message: "Bayi lisansı güncellendi." };
}

/**
 * Store managers are intentionally NOT individually suspendable: the store is
 * the licensing unit. Suspending a manager used to lock the account out of the
 * panel and produced an infinite redirect loop. Only `setStoreSuspension` exists.
 */
export async function getStoreSuspensionInfo(storeId: number): Promise<ActionResult<{ suspended: boolean }>> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const rows = await db.select({ status: stores.status }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!rows[0]) return { ok: false, message: "Mağaza bulunamadı." };
  return { ok: true, data: { suspended: rows[0].status === "suspended" } };
}

export async function setStoreSuspension(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const storeId = Number(formData.get("storeId"));
  const suspended = String(formData.get("suspended")) === "true";
  if (!Number.isInteger(storeId)) return { ok: false, message: "Mağaza bulunamadı." };

  const rows = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  const store = rows[0];
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };

  await db
    .update(stores)
    .set({ status: suspended ? "suspended" : "active", updatedAt: new Date() })
    .where(eq(stores.id, store.id));

  await logAudit({
    action: suspended ? "super.store.suspend" : "super.store.resume",
    entity: "store",
    entityId: store.id,
    summary: `${store.name} mağazası ${suspended ? "askıya alındı" : "yeniden aktifleştirildi"}`,
    severity: suspended ? "warn" : "info",
    storeId: store.id,
    storeSlug: store.slug,
  });

  revalidatePath("/super-admin");
  revalidatePath(`/${store.slug}`, "layout");
  return { ok: true, message: suspended ? "Bayi askıya alındı." : "Bayi yeniden aktifleştirildi." };
}

/* ------------------------- Duyuru & güncelleme ------------------------ */

export async function savePlatformPost(formData: FormData): Promise<ActionResult<{ id: number }>> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };

  const idRaw = String(formData.get("id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "announcement") === "update" ? "update" : "announcement";
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const version = String(formData.get("version") ?? "").trim();
  const pinned = formData.get("pinned") === "on" || formData.get("pinned") === "true";

  if (title.length < 3) return { ok: false, message: "Başlık en az 3 karakter olmalıdır." };
  if (title.length > 120) return { ok: false, message: "Başlık en fazla 120 karakter olabilir." };
  if (body.length > 8000) return { ok: false, message: "İçerik en fazla 8000 karakter olabilir." };
  if (version.length > 24) return { ok: false, message: "Sürüm etiketi en fazla 24 karakter olabilir." };

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
    if (!Number.isInteger(id)) return { ok: false, message: "Geçersiz kayıt." };
    const updated = await db
      .update(platformPosts)
      .set(values)
      .where(eq(platformPosts.id, id))
      .returning({ id: platformPosts.id });
    if (updated.length === 0) return { ok: false, message: "Kayıt bulunamadı." };
    await logAudit({
      action: "super.post.update",
      entity: "platform_post",
      entityId: id,
      summary: `${kind === "update" ? "Güncelleme" : "Duyuru"} düzenlendi: ${title}`,
      metadata: { kind, version, pinned },
    });
    revalidatePath("/super-admin");
    revalidatePath("/super-admin/duyurular");
    return { ok: true, message: "Kayıt güncellendi.", data: { id: updated[0].id } };
  }

  const [created] = await db
    .insert(platformPosts)
    .values({ ...values, publishedAt: new Date() })
    .returning();

  await logAudit({
    action: "super.post.create",
    entity: "platform_post",
    entityId: created.id,
    summary: `${kind === "update" ? "Güncelleme" : "Duyuru"} yayınlandı: ${title}`,
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
    message: `${kind === "update" ? "Güncelleme notu yayınlandı" : "Duyuru yayınlandı"} — ${broadcast.sent} mağazaya e-posta gönderildi.`,
    data: { id: created.id },
  };
}

export async function deletePlatformPost(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "Geçersiz kayıt." };
  const removed = await db.select().from(platformPosts).where(eq(platformPosts.id, id)).limit(1);
  await db.delete(platformPosts).where(eq(platformPosts.id, id));
  await logAudit({
    action: "super.post.delete",
    entity: "platform_post",
    entityId: id,
    summary: `Duyuru silindi: ${removed[0]?.title ?? id}`,
    severity: "warn",
    metadata: { kind: removed[0]?.kind ?? null },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/duyurular");
  return { ok: true, message: "Kayıt silindi." };
}

export async function setPlatformPostPinned(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
  const id = Number(formData.get("id"));
  const pinned = String(formData.get("pinned")) === "true";
  if (!Number.isInteger(id)) return { ok: false, message: "Geçersiz kayıt." };
  await db.update(platformPosts).set({ pinned, updatedAt: new Date() }).where(eq(platformPosts.id, id));
  await logAudit({
    action: "super.post.pin",
    entity: "platform_post",
    entityId: id,
    summary: pinned ? "Duyuru sabitlendi" : "Sabitleme kaldırıldı",
    metadata: { pinned },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/duyurular");
  return { ok: true, message: pinned ? "Kayıt sabitlendi." : "Sabitleme kaldırıldı." };
}

/**
 * Renewal link and support e-mail come from environment variables
 * (`RENEWAL_URL`, `SUPPORT_EMAIL`) and are intentionally not editable from the
 * dashboard: a compromised super-admin session must not be able to redirect
 * payment flows.
 */
export async function updatePlatformSettings(formData: FormData): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, message: "Yetkiniz yok." };
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
    summary: "Sistem ayarları güncellendi",
    metadata: { defaultPlanNoteLength: defaultPlanNote.length },
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/ayarlar");
  revalidatePath("/", "layout");
  return { ok: true, message: "Sistem ayarları kaydedildi. Süre uzatma linki ve destek e-postası .env dosyasından okunur." };
}
