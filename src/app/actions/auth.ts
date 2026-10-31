"use server";

import { getTranslator } from "@/lib/i18n/server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureDatabase } from "@/db";
import { customers, resellerKeys, securityFactors, storeAdmins, stores } from "@/db/schema";
import { hashPassword, safeEqual, verifyPassword } from "@/lib/crypto";
import { rememberPassword } from "@/lib/password-vault";
import { env } from "@/lib/env";
import { RESERVED_SLUGS, slugify } from "@/lib/format";
import { managerIdentifierError } from "@/lib/admin-guard";
import { hitRateLimit, recordSuccess } from "@/lib/rate-limit";
import {
  CUSTOMER_COOKIE,
  STORE_COOKIE,
  SUPER_COOKIE,
  clearSessionCookie,
  sessionVisible,
  setPendingSubject,
  setSessionCookie,
} from "@/lib/session";
import { sweepExpiredEntitlements } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendWelcomeMail } from "@/lib/mail-events";
import { mailVerificationEnabled } from "@/lib/env";
import { consumeVerification, createVerification } from "@/lib/verification";
import { currentLocaleCode } from "@/lib/i18n/server";
import type { ActionResult } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function grantStoreAdminSession(
  admin: typeof storeAdmins.$inferSelect,
  store: typeof stores.$inferSelect,
): Promise<ActionResult> {
  await db
    .update(storeAdmins)
    .set({ lastLoginAt: new Date() })
    .where(and(eq(storeAdmins.id, admin.id), eq(storeAdmins.storeId, store.id)));
  await clearSessionCookie(SUPER_COOKIE);
  await setSessionCookie(STORE_COOKIE, {
    kind: "store",
    storeId: store.id,
    adminId: admin.id,
    username: admin.username,
    slug: store.slug,
  });
  return { ok: true, redirectTo: `/${store.slug}/admin` };
}

async function factorMethods(
  subjectType: "super" | "store" | "customer",
  subjectId: number,
): Promise<{ totp: boolean; passkey: boolean; question: boolean; email: boolean }> {
  const rows = await db
    .select({ kind: securityFactors.kind })
    .from(securityFactors)
    .where(and(eq(securityFactors.subjectType, subjectType), eq(securityFactors.subjectId, subjectId)));
  const kinds = new Set(rows.map((row) => row.kind));
  return {
    totp: kinds.has("totp"),
    passkey: kinds.has("passkey"),
    question: kinds.has("question"),
    email: kinds.has("email"),
  };
}

type PendingInput =
  | { t: "super"; id: number; username: string }
  | { t: "store"; id: number; storeId: number; slug: string; username: string }
  | { t: "customer"; id: number; storeId: number; slug: string; username: string };

async function startPendingOrSession(subject: PendingInput, redirectTo: string): Promise<ActionResult> {
  const { t } = await getTranslator();
  const methods = await factorMethods(subject.t, subject.id);
  if (!methods.totp && !methods.passkey && !methods.question && !methods.email) {
    if (subject.t === "super") {
      await clearSessionCookie(STORE_COOKIE);
      await setSessionCookie(SUPER_COOKIE, { kind: "super", id: 1, username: subject.username });
    } else if (subject.t === "store" && subject.slug) {
      const store = await db.select().from(stores).where(eq(stores.slug, subject.slug)).limit(1);
      const admin = await db
        .select()
        .from(storeAdmins)
        .where(eq(storeAdmins.id, subject.id))
        .limit(1);
      if (store[0] && admin[0]) {
        await grantStoreAdminSession(admin[0], store[0]);
        return { ok: true, redirectTo };
      }
    } else if (subject.t === "customer" && subject.slug) {
      await setSessionCookie(CUSTOMER_COOKIE, {
        kind: "customer",
        storeId: subject.storeId,
        customerId: subject.id,
        username: subject.username,
      });
      revalidatePath(`/${subject.slug}`, "layout");
    }
    return { ok: true, redirectTo };
  }
  await setPendingSubject(subject);
  return {
    ok: true,
    needs2fa: true,
    methods,
    redirectTo,
    message: t("x.hesabnz-2fa-korumal-ikinci-admda-dogrulama-yapn"),
  };
}

/* ------------------------------- Session check ------------------------------ */

/**
 * Confirms that the session cookie survived the round-trip.
 *
 * A login can look successful on the client and still be pointless: the browser
 * may drop the cookie (third-party cookie blocking inside a preview iframe, a
 * `Secure` cookie on an http origin, a privacy extension) and every following
 * request is anonymous — the panel appears and immediately bounces back to the
 * form. Checking server-side lets the form explain the real problem instead.
 */
export async function sessionReady(
  kind: "super" | "store" | "customer",
): Promise<ActionResult<{ kept: boolean }>> {
  const { t } = await getTranslator();
  const kept = await sessionVisible(kind);
  return {
    ok: true,
    message: kept ? "" : t("x.tarayc-oturum-cerezini-engelledi-uygulamay-yeni-sekmede-acn"),
    data: { kept },
  };
}

/* --------------------------- Unified manager login --------------------------- */

/** Single login entry: platform owner or any store administrator (globally unique username). */
export async function managerLogin(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const identifier = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { ok: false, message: t("x.kullanc-ad-veya-e-posta-ile-sifre-zorunludur") };
  }
  if (identifier.length > 254 || password.length > 256) {
    return { ok: false, message: t("x.giris-bilgileri-hatal") };
  }

  const gate = hitRateLimit(`mgr:${identifier}`);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-deneme-seconds-saniye-tekrar-deneyin", { seconds: gate.retryInSeconds }) };
  }

  const ownerIdentifiers = [env.superAdminUsername, env.superAdminEmail]
    .filter(Boolean)
    .map((value) => value.trim().toLowerCase());
  const isOwner =
    !!env.superAdminPassword &&
    ownerIdentifiers.includes(identifier) &&
    (env.superAdminPassword.startsWith("scrypt$")
      ? verifyPassword(password, env.superAdminPassword)
      : safeEqual(password, env.superAdminPassword));

  if (isOwner) {
    recordSuccess(`mgr:${identifier}`);
    await logAudit({
      action: "auth.login",
      entity: "super_admin",
      entityId: 1,
      summaryKey: "x.user-super-admin-paneline-giris-yapt",
      summaryParams: { user: env.superAdminUsername },
      actorType: "super",
      actorId: 1,
      actorName: env.superAdminUsername,
      metadata: { via: "manager-login" },
    });
    return startPendingOrSession({ t: "super", id: 1, username: env.superAdminUsername }, "/super-admin");
  }

  await ensureDatabase();
  const candidates = await db
    .select({ admin: storeAdmins, store: stores })
    .from(storeAdmins)
    .innerJoin(stores, eq(storeAdmins.storeId, stores.id))
    .where(
      sql`(lower(${storeAdmins.username}) = ${identifier} or lower(${storeAdmins.email}) = ${identifier})`,
    )
    .limit(21);

  if (candidates.length === 21) {
    return { ok: false, message: t("x.giris-bilgileri-cok-fazla-hesapta-eslesti-daha-spesifik") };
  }

  const matches = candidates.filter(({ admin }) => verifyPassword(password, admin.passwordHash));
  if (matches.length === 0) {
    await logAudit({
      action: "auth.login.failed",
      entity: "store_admin",
      summaryKey: "x.basarsz-yonetici-girisi-identifier",
      summaryParams: { identifier: identifier.slice(0, 60) },
      severity: "warn",
      actorType: "system",
      actorName: identifier.slice(0, 60),
      metadata: { identifier, reason: "invalid_credentials" },
    });
    return { ok: false, message: t("x.kullanc-ad-e-posta-veya-sifre-hatal") };
  }
  if (matches.length > 1) {
    return { ok: false, message: t("x.bu-bilgiler-birden-fazla-hesapta-eslesiyor-lutfen-tekrar") };
  }

  const { admin, store } = matches[0];
  recordSuccess(`mgr:${identifier}`);
  await logAudit({
    action: "auth.login",
    entity: "store_admin",
    entityId: admin.id,
    summaryKey: "x.user-yonetici-paneline-giris-yapt",
    summaryParams: { user: admin.username },
    storeId: store.id,
    storeSlug: store.slug,
    actorType: "store",
    actorId: admin.id,
    actorName: admin.username,
    metadata: { via: "manager-login" },
  });
  return startPendingOrSession(
    { t: "store", id: admin.id, storeId: store.id, slug: store.slug, username: admin.username },
    `/${store.slug}/admin`,
  );
}

/* --------------------------- Reseller activation --------------------------- */

export async function activateReseller(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const keyCode = String(formData.get("resellerCode") ?? "").trim().toUpperCase();
  const storeName = String(formData.get("storeName") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim().toLowerCase();
  const adminUsername = String(formData.get("adminUsername") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (!keyCode) return { ok: false, message: "Bayilik kodu zorunludur." };
  if (!storeName) return { ok: false, message: t("x.magaza-ad-zorunludur") };

  const slug = slugify(slugInput);
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) {
    return {
      ok: false,
      message: t("x.magaza-id-3-30-karakter-olmal-sadece-kucuk-harf-rakam-ve"),
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: t("x.bu-magaza-id-sisteme-ayrlms-durumda-baska-bir-id-secin") };
  }
  if (adminUsername.length < 3) {
    return { ok: false, message: t("x.yonetici-kullanc-ad-en-az-3-karakter-olmaldr") };
  }
  if (!EMAIL_RE.test(adminEmail)) {
    return { ok: false, message: t("x.gecerli-bir-yonetici-e-postas-girin") };
  }
  const reserved = await managerIdentifierError(adminUsername, adminEmail);
  if (reserved) return { ok: false, message: reserved };
  if (adminPassword.length < 6) {
    return { ok: false, message: t("x.sifre-en-az-6-karakter-olmaldr") };
  }

  const existingSlug = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
  if (existingSlug.length > 0) {
    return { ok: false, message: t("x.bu-magaza-id-zaten-kullanlyor") };
  }

  const takenUsername = await db
    .select({ id: storeAdmins.id })
    .from(storeAdmins)
    .where(sql`lower(${storeAdmins.username}) = ${adminUsername.toLowerCase()}`)
    .limit(1);
  if (takenUsername.length > 0) {
    return {
      ok: false,
      message: t("x.bu-yonetici-kullanc-ad-platformda-zaten-kullanlyor-yonet"),
    };
  }

  const keyRows = await db
    .select()
    .from(resellerKeys)
    .where(eq(resellerKeys.code, keyCode))
    .limit(1);
  const resellerKey = keyRows[0];
  if (!resellerKey) return { ok: false, message: t("x.bayilik-kodu-bulunamad") };
  if (resellerKey.status === "used") {
    return { ok: false, message: t("x.bu-bayilik-kodu-daha-once-kullanlms") };
  }
  if (resellerKey.status === "revoked") {
    return { ok: false, message: t("x.bu-bayilik-kodu-iptal-edilmis") };
  }

  const expiresAt =
    resellerKey.durationDays === null
      ? null
      : new Date(Date.now() + resellerKey.durationDays * 86_400_000);

  try {
    const createdStore = await db.transaction(async (tx) => {
      const [store] = await tx
        .insert(stores)
        .values({
          slug,
          name: storeName,
          title: storeName,
          subtitle: t("x.oyun-ve-hesap-kodlarn-saniyeler-icinde-teslim-aln"),
          primaryColor: "#0f1117",
          accentColor: "#6366f1",
          fontFamily: "Inter",
          expiresAt,
          maxAccounts: resellerKey.maxAccounts,
          renewalUrl: resellerKey.renewalUrl,
          resellerKeyId: resellerKey.id,
          status: "active",
        })
        .returning();

      await tx.insert(storeAdmins).values({
        storeId: store.id,
        username: adminUsername,
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        passwordEnc: rememberPassword(adminPassword),
      });

      await tx
        .update(resellerKeys)
        .set({ status: "used", usedAt: new Date(), storeId: store.id })
        .where(eq(resellerKeys.id, resellerKey.id));

      return store;
    });
    const createdStoreId = createdStore.id;

    const adminRows = await db
      .select()
      .from(storeAdmins)
      .where(eq(storeAdmins.storeId, createdStoreId))
      .limit(1);

    // Activation e-mail (best effort; never blocks the signup).
    await sendWelcomeMail(createdStore, adminRows[0]).catch((err) =>
      console.error("[signup] welcome mail failed", err),
    );

    await setSessionCookie(STORE_COOKIE, {
      kind: "store",
      storeId: createdStoreId,
      adminId: adminRows[0].id,
      username: adminRows[0].username,
      slug,
    });

    revalidatePath("/super-admin");
    return {
      ok: true,
      message: t("x.magazanz-hazr-yonetim-paneline-yonlendiriliyorsunuz"),
      redirectTo: `/${slug}/admin`,
    };
  } catch {
    return { ok: false, message: t("x.magaza-olusturulamad-lutfen-tekrar-deneyin") };
  }
}

/* ----------------------------- Store admin auth ----------------------------- */

export async function storeAdminLogin(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const identifier = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!slug || !identifier || !password) {
    return { ok: false, message: t("x.tum-alanlar-doldurun") };
  }

  const gate = hitRateLimit(`st:${slug}:${identifier}`);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-deneme-seconds-saniye-tekrar-deneyin", { seconds: gate.retryInSeconds }) };
  }

  const storeRows = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  const store = storeRows[0];
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };

  const adminRows = await db
    .select()
    .from(storeAdmins)
    .where(
      and(
        eq(storeAdmins.storeId, store.id),
        sql`(lower(${storeAdmins.username}) = ${identifier} or lower(${storeAdmins.email}) = ${identifier})`,
      ),
    );
  const admin = adminRows.find((row) => verifyPassword(password, row.passwordHash));
  if (!admin) {
    await logAudit({
      action: "auth.login.failed",
      entity: "store_admin",
      summaryKey: "x.basarsz-magaza-paneli-girisi-store-identifier",
      summaryParams: { store: store.slug, identifier: identifier.slice(0, 60) },
      severity: "warn",
      storeId: store.id,
      storeSlug: store.slug,
      actorType: "system",
      actorName: identifier.slice(0, 60),
      metadata: { identifier, reason: "invalid_credentials" },
    });
    return { ok: false, message: t("x.kullanc-ad-veya-sifre-hatal") };
  }
  recordSuccess(`st:${slug}:${identifier}`);
  await logAudit({
    action: "auth.login",
    entity: "store_admin",
    entityId: admin.id,
    summaryKey: "x.user-magaza-paneline-giris-yapt",
    summaryParams: { user: admin.username },
    storeId: store.id,
    storeSlug: store.slug,
    actorType: "store",
    actorId: admin.id,
    actorName: admin.username,
    metadata: { via: "store-login" },
  });
  return startPendingOrSession(
    { t: "store", id: admin.id, storeId: store.id, slug: store.slug, username: admin.username },
    `/${store.slug}/admin`,
  );
}

export async function storeAdminLogout(slug: string): Promise<ActionResult> {
  const { t } = await getTranslator();
  await logAudit({ action: "auth.logout", entity: "store_admin", summaryKey: "x.magaza-panelinden-cks-yapld", storeSlug: slug });
  await clearSessionCookie(STORE_COOKIE);
  return { ok: true, redirectTo: `/${slug}/admin/giris` };
}

export async function superAdminLogout(): Promise<ActionResult> {
  const { t } = await getTranslator();
  await logAudit({ action: "auth.logout", entity: "super_admin", summaryKey: "x.super-admin-panelinden-cks-yapld", actorType: "super" });
  await clearSessionCookie(SUPER_COOKIE);
  return { ok: true, redirectTo: "/super-admin" };
}

/* ------------------------------ Customer auth ------------------------------ */

async function loadStore(slug: string) {
  await ensureDatabase();
  const rows = await db.select().from(stores).where(eq(stores.slug, slug.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

async function signCustomer(storeId: number, slug: string, customer: { id: number; username: string }) {
  await setSessionCookie(CUSTOMER_COOKIE, {
    kind: "customer",
    storeId,
    customerId: customer.id,
    username: customer.username,
  });
  revalidatePath(`/${slug}`, "layout");
}

export async function customerRegister(
  formData: FormData,
): Promise<ActionResult<{ username: string; verificationId?: number; email?: string }>> {
  const { t } = await getTranslator();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || username;
  const email = String(formData.get("email") ?? "").trim();

  if (!slug) return { ok: false, message: t("x.magaza-bilgisi-eksik") };
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return {
      ok: false,
      message: t("x.kullanc-ad-3-24-karakter-olmal-harf-rakam-nokta-tire-ve"),
    };
  }
  if (password.length < 6) return { ok: false, message: t("x.sifre-en-az-6-karakter-olmaldr") };
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: t("x.gecerli-bir-e-posta-girin") };

  const store = await loadStore(slug);
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };

  // SMTP configured -> e-mail verification is mandatory before the account is usable.
  const verificationOn = mailVerificationEnabled();
  if (verificationOn && !email) {
    return { ok: false, message: t("x.e-posta-dogrulamas-ack-kayt-icin-gecerli-bir-e-posta-gir") };
  }

  const exists = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.storeId, store.id), sql`lower(${customers.username}) = ${username.toLowerCase()}`),
    )
    .limit(1);
  if (exists.length > 0) return { ok: false, message: t("x.bu-kullanc-ad-zaten-alnms") };

  const [customer] = await db
    .insert(customers)
    .values({
      storeId: store.id,
      username,
      displayName,
      email: email || null,
      passwordHash: hashPassword(password),
      passwordEnc: rememberPassword(password),
      emailVerifiedAt: verificationOn ? null : new Date(),
    })
    .returning();

  await logAudit({
    action: "customer.register",
    entity: "customer",
    entityId: customer.id,
    storeId: store.id,
    storeSlug: store.slug,
    summaryKey: "x.user-kayt-oldu",
    summaryParams: { user: customer.username },
    metadata: { email: email || null, verification: verificationOn },
  });

  if (verificationOn) {
    const locale = await currentLocaleCode();
    const challenge = await createVerification({
      storeId: store.id,
      storeSlug: store.slug,
      storeName: store.name,
      email,
      username: customer.username,
      purpose: "signup",
      customerId: customer.id,
      locale,
    });
    await db.update(customers).set({ status: "pending" }).where(eq(customers.id, customer.id));
    return {
      ok: true,
      message:
        challenge.delivered === "sent"
          ? t("x.dogrulama-kodu-e-postanza-gonderildi")
          : t("x.dogrulama-kayd-olusturuldu-ancak-e-posta-gonderilemedi-y"),
      data: { username: customer.username, verificationId: challenge.id, email },
    };
  }

  await signCustomer(store.id, store.slug, customer);
  return { ok: true, message: t("x.hesabnz-olusturuldu"), data: { username: customer.username } };
}

/**
 * Completes registration (or a gated sign-in) with the 6-digit code that was
 * e-mailed. Only then is the session granted.
 */
export async function verifyCustomerEmail(
  slugRaw: string,
  identifier: { id?: number | null; token?: string | null },
  code: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const slug = slugRaw.trim().toLowerCase();
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };

  const outcome = await consumeVerification(identifier, code);
  if (!outcome.ok) return { ok: false, message: outcome.message };
  if (outcome.storeId !== store.id) return { ok: false, message: t("x.bu-kod-bu-magaza-icin-gecerli-degil") };
  if (!outcome.customerId) return { ok: false, message: t("x.dogrulama-kayd-bir-hesaba-bagl-degil") };

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, outcome.customerId), eq(customers.storeId, store.id)))
    .limit(1);
  const customer = rows[0];
  if (!customer) return { ok: false, message: t("x.hesap-bulunamad") };
  if (customer.status === "banned") return { ok: false, message: t("x.hesabnz-yasaklanms") };

  await db
    .update(customers)
    .set({ emailVerifiedAt: new Date(), status: "active" })
    .where(eq(customers.id, customer.id));

  await signCustomer(store.id, store.slug, customer);
  await logAudit({
    action: "customer.email_verified",
    entity: "customer",
    entityId: customer.id,
    storeId: store.id,
    storeSlug: store.slug,
    summaryKey: "x.user-e-postasn-dogrulad",
    summaryParams: { user: customer.username },
  });

  return { ok: true, message: t("x.e-posta-dogruland-giris-yapld"), data: { redirectTo: `/${store.slug}/kutuphane` } };
}

/** Re-sends a fresh 6-digit code for a pending registration. */
export async function resendCustomerVerification(
  slugRaw: string,
  emailRaw: string,
): Promise<ActionResult<{ verificationId: number }>> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const slug = slugRaw.trim().toLowerCase();
  const email = emailRaw.trim();
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };
  if (!EMAIL_RE.test(email)) return { ok: false, message: t("x.gecerli-bir-e-posta-girin") };

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, store.id), sql`lower(${customers.email}) = ${email.toLowerCase()}`))
    .limit(1);
  const customer = rows[0];
  if (!customer) return { ok: false, message: t("x.bu-e-posta-ile-kaytl-bir-hesap-yok") };

  const gate = hitRateLimit(`resend:${store.id}:${email.toLowerCase()}`, 3, 300_000);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-kod-istegi-seconds-saniye-sonra-deneyin", { seconds: gate.retryInSeconds }) };
  }

  const locale = await currentLocaleCode();
  const challenge = await createVerification({
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.name,
    email,
    username: customer.username,
    purpose: "signup",
    customerId: customer.id,
    locale,
  });
  return {
    ok: true,
    message: t("x.yeni-dogrulama-kodu-gonderildi"),
    data: { verificationId: challenge.id },
  };
}

export async function customerLogin(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };
  if (!username || !password) return { ok: false, message: t("x.kullanc-ad-ve-sifre-zorunludur") };

  const gate = hitRateLimit(`cu:${slug}:${username.toLowerCase()}`);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-deneme-seconds-saniye-tekrar-deneyin", { seconds: gate.retryInSeconds }) };
  }

  const rows = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.storeId, store.id), sql`lower(${customers.username}) = ${username.toLowerCase()}`),
    )
    .limit(1);
  const customer = rows[0];
  if (!customer || !verifyPassword(password, customer.passwordHash)) {
    await logAudit({
      action: "auth.login.failed",
      entity: "customer",
      summaryKey: "x.basarsz-musteri-girisi-store-identifier",
      summaryParams: { store: store.slug, identifier: username.slice(0, 60) },
      severity: "warn",
      storeId: store.id,
      storeSlug: store.slug,
      actorType: "system",
      actorName: username.slice(0, 60),
      metadata: { reason: "invalid_credentials" },
    });
    return { ok: false, message: t("x.kullanc-ad-veya-sifre-hatal") };
  }
  if (customer.status === "banned") {
    return { ok: false, message: t("x.hesabnz-magaza-yoneticisi-tarafndan-yasakland") };
  }
  if (mailVerificationEnabled() && customer.email && !customer.emailVerifiedAt) {
    const locale = await currentLocaleCode();
    const challenge = await createVerification({
      storeId: store.id,
      storeSlug: store.slug,
      storeName: store.name,
      email: customer.email,
      username: customer.username,
      purpose: "login",
      customerId: customer.id,
      locale,
    });
    return {
      ok: true,
      message: t("x.e-posta-adresiniz-dogrulanmams-yeni-bir-dogrulama-kodu-g"),
      needsEmailVerification: true,
      verificationId: challenge.id,
      verificationEmail: customer.email,
    };
  }
  recordSuccess(`cu:${slug}:${username.toLowerCase()}`);
  await logAudit({
    action: "auth.login",
    entity: "customer",
    entityId: customer.id,
    summaryKey: "x.user-musteri-olarak-giris-yapt",
    summaryParams: { user: customer.username },
    storeId: store.id,
    storeSlug: store.slug,
    actorType: "customer",
    actorId: customer.id,
    actorName: customer.username,
  });
  return startPendingOrSession(
    { t: "customer", id: customer.id, storeId: store.id, slug: store.slug, username: customer.username },
    `/${store.slug}/kutuphane`,
  );
}

export async function customerLogout(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  await logAudit({ action: "auth.logout", entity: "customer", summaryKey: "x.musteri-cks-yapt", storeSlug: slug });
  await clearSessionCookie(CUSTOMER_COOKIE);
  if (slug) revalidatePath(`/${slug}`, "layout");
  return { ok: true, redirectTo: `/${slug}` };
}

export async function updateCustomerProfile(
  formData: FormData,
): Promise<ActionResult<{ username: string }>> {
  const { t } = await getTranslator();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: t("x.magaza-bulunamad-2") };

  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.storeId, store.id),
        eq(customers.username, String(formData.get("currentUsername") ?? "")),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current) return { ok: false, message: t("x.oturum-bulunamad") };
  if (current.status === "banned") return { ok: false, message: t("x.hesabnz-yasakl-durumda") };

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const currentPassword = String(formData.get("currentPassword") ?? "");

  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return { ok: false, message: t("x.kullanc-ad-3-24-karakter-olmaldr") };
  }
  if (username.toLowerCase() !== current.username.toLowerCase()) {
    const exists = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.storeId, store.id),
          sql`lower(${customers.username}) = ${username.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (exists.length > 0) return { ok: false, message: t("x.bu-kullanc-ad-bu-magazada-zaten-kullanlyor") };
  }
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: t("x.gecerli-bir-e-posta-girin") };
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) return { ok: false, message: t("x.profil-fotograf-adresi-http-s-ile-baslamaldr") };
  let passwordHash = current.passwordHash;
  if (newPassword) {
    if (newPassword.length < 6) return { ok: false, message: t("x.yeni-sifre-en-az-6-karakter-olmaldr") };
    if (!verifyPassword(currentPassword, current.passwordHash)) {
      return { ok: false, message: t("x.mevcut-sifreniz-hatal") };
    }
    passwordHash = hashPassword(newPassword);
  }

  await db
    .update(customers)
    .set({
      username,
      displayName: displayName || username,
      email: email || null,
      avatarUrl,
      passwordHash,
      ...(newPassword ? { passwordEnc: rememberPassword(newPassword) } : {}),
    })
    .where(eq(customers.id, current.id));

  await signCustomer(store.id, store.slug, { id: current.id, username });
  return { ok: true, message: t("x.profil-guncellendi-2"), data: { username } };
}

/** Frees accounts whose delivery window has ended before rendering storefront data. */
export async function sweepStoreExpired(slug: string): Promise<void> {
  const store = await loadStore(slug);
  if (!store) return;
  await sweepExpiredEntitlements(store.id);
}
