"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureDatabase } from "@/db";
import { customers, resellerKeys, securityFactors, storeAdmins, stores } from "@/db/schema";
import { hashPassword, safeEqual, verifyPassword } from "@/lib/crypto";
import { env } from "@/lib/env";
import { RESERVED_SLUGS, slugify } from "@/lib/format";
import { managerIdentifierError } from "@/lib/admin-guard";
import { hitRateLimit, recordSuccess } from "@/lib/rate-limit";
import {
  CUSTOMER_COOKIE,
  STORE_COOKIE,
  SUPER_COOKIE,
  clearSessionCookie,
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
    message: "Hesabınız 2FA korumalı. İkinci adımda doğrulama yapın.",
  };
}

/* --------------------------- Unified manager login --------------------------- */

/** Single login entry: platform owner or any store administrator (globally unique username). */
export async function managerLogin(formData: FormData): Promise<ActionResult> {
  const identifier = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { ok: false, message: "Kullanıcı adı veya e-posta ile şifre zorunludur." };
  }
  if (identifier.length > 254 || password.length > 256) {
    return { ok: false, message: "Giriş bilgileri hatalı." };
  }

  const gate = hitRateLimit(`mgr:${identifier}`);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla deneme. ${gate.retryInSeconds} saniye tekrar deneyin.` };
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
      summary: `${env.superAdminUsername} süper admin paneline giriş yaptı`,
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
    return { ok: false, message: "Giriş bilgileri çok fazla hesapta eşleşti. Daha spesifik bir kullanıcı adı girin." };
  }

  const matches = candidates.filter(({ admin }) => verifyPassword(password, admin.passwordHash));
  if (matches.length === 0) {
    await logAudit({
      action: "auth.login.failed",
      entity: "store_admin",
      summary: `Başarısız yönetici girişi: ${identifier.slice(0, 60)}`,
      severity: "warn",
      actorType: "system",
      actorName: identifier.slice(0, 60),
      metadata: { identifier, reason: "invalid_credentials" },
    });
    return { ok: false, message: "Kullanıcı adı, e-posta veya şifre hatalı." };
  }
  if (matches.length > 1) {
    return { ok: false, message: "Bu bilgiler birden fazla hesapta eşleşiyor. Lütfen tekrar deneyin." };
  }

  const { admin, store } = matches[0];
  recordSuccess(`mgr:${identifier}`);
  await logAudit({
    action: "auth.login",
    entity: "store_admin",
    entityId: admin.id,
    summary: `${admin.username} yönetici paneline giriş yaptı`,
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
  await ensureDatabase();
  const keyCode = String(formData.get("resellerCode") ?? "").trim().toUpperCase();
  const storeName = String(formData.get("storeName") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim().toLowerCase();
  const adminUsername = String(formData.get("adminUsername") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (!keyCode) return { ok: false, message: "Bayilik kodu zorunludur." };
  if (!storeName) return { ok: false, message: "Mağaza adı zorunludur." };

  const slug = slugify(slugInput);
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug)) {
    return {
      ok: false,
      message: "Mağaza ID 3-30 karakter olmalı; sadece küçük harf, rakam ve tire kullanılabilir.",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: "Bu mağaza ID sisteme ayrılmış durumda, başka bir ID seçin." };
  }
  if (adminUsername.length < 3) {
    return { ok: false, message: "Yönetici kullanıcı adı en az 3 karakter olmalıdır." };
  }
  if (!EMAIL_RE.test(adminEmail)) {
    return { ok: false, message: "Geçerli bir yönetici e-postası girin." };
  }
  const reserved = managerIdentifierError(adminUsername, adminEmail);
  if (reserved) return { ok: false, message: reserved };
  if (adminPassword.length < 6) {
    return { ok: false, message: "Şifre en az 6 karakter olmalıdır." };
  }

  const existingSlug = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
  if (existingSlug.length > 0) {
    return { ok: false, message: "Bu mağaza ID zaten kullanılıyor." };
  }

  const takenUsername = await db
    .select({ id: storeAdmins.id })
    .from(storeAdmins)
    .where(sql`lower(${storeAdmins.username}) = ${adminUsername.toLowerCase()}`)
    .limit(1);
  if (takenUsername.length > 0) {
    return {
      ok: false,
      message: "Bu yönetici kullanıcı adı platformda zaten kullanılıyor. Yönetici kullanıcı adları tüm mağazalar arasında benzersizdir.",
    };
  }

  const keyRows = await db
    .select()
    .from(resellerKeys)
    .where(eq(resellerKeys.code, keyCode))
    .limit(1);
  const resellerKey = keyRows[0];
  if (!resellerKey) return { ok: false, message: "Bayilik kodu bulunamadı." };
  if (resellerKey.status === "used") {
    return { ok: false, message: "Bu bayilik kodu daha önce kullanılmış." };
  }
  if (resellerKey.status === "revoked") {
    return { ok: false, message: "Bu bayilik kodu iptal edilmiş." };
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
          subtitle: "Oyun ve hesap kodlarını saniyeler içinde teslim alın.",
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
      message: "Mağazanız hazır. Yönetim paneline yönlendiriliyorsunuz.",
      redirectTo: `/${slug}/admin`,
    };
  } catch {
    return { ok: false, message: "Mağaza oluşturulamadı. Lütfen tekrar deneyin." };
  }
}

/* ----------------------------- Store admin auth ----------------------------- */

export async function storeAdminLogin(formData: FormData): Promise<ActionResult> {
  await ensureDatabase();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const identifier = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!slug || !identifier || !password) {
    return { ok: false, message: "Tüm alanları doldurun." };
  }

  const gate = hitRateLimit(`st:${slug}:${identifier}`);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla deneme. ${gate.retryInSeconds} saniye tekrar deneyin.` };
  }

  const storeRows = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  const store = storeRows[0];
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };

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
      summary: `Başarısız mağaza paneli girişi (${store.slug}): ${identifier.slice(0, 60)}`,
      severity: "warn",
      storeId: store.id,
      storeSlug: store.slug,
      actorType: "system",
      actorName: identifier.slice(0, 60),
      metadata: { identifier, reason: "invalid_credentials" },
    });
    return { ok: false, message: "Kullanıcı adı veya şifre hatalı." };
  }
  recordSuccess(`st:${slug}:${identifier}`);
  await logAudit({
    action: "auth.login",
    entity: "store_admin",
    entityId: admin.id,
    summary: `${admin.username} mağaza paneline giriş yaptı`,
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
  await logAudit({ action: "auth.logout", entity: "store_admin", summary: "Mağaza panelinden çıkış yapıldı", storeSlug: slug });
  await clearSessionCookie(STORE_COOKIE);
  return { ok: true, redirectTo: `/${slug}/admin/giris` };
}

export async function superAdminLogout(): Promise<ActionResult> {
  await logAudit({ action: "auth.logout", entity: "super_admin", summary: "Süper admin panelinden çıkış yapıldı", actorType: "super" });
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
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || username;
  const email = String(formData.get("email") ?? "").trim();

  if (!slug) return { ok: false, message: "Mağaza bilgisi eksik." };
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return {
      ok: false,
      message: "Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi.",
    };
  }
  if (password.length < 6) return { ok: false, message: "Şifre en az 6 karakter olmalıdır." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: "Geçerli bir e-posta girin." };

  const store = await loadStore(slug);
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };

  // SMTP configured -> e-mail verification is mandatory before the account is usable.
  const verificationOn = mailVerificationEnabled();
  if (verificationOn && !email) {
    return { ok: false, message: "E-posta doğrulaması açık. Kayıt için geçerli bir e-posta girin." };
  }

  const exists = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.storeId, store.id), sql`lower(${customers.username}) = ${username.toLowerCase()}`),
    )
    .limit(1);
  if (exists.length > 0) return { ok: false, message: "Bu kullanıcı adı zaten alınmış." };

  const [customer] = await db
    .insert(customers)
    .values({
      storeId: store.id,
      username,
      displayName,
      email: email || null,
      passwordHash: hashPassword(password),
      emailVerifiedAt: verificationOn ? null : new Date(),
    })
    .returning();

  await logAudit({
    action: "customer.register",
    entity: "customer",
    entityId: customer.id,
    storeId: store.id,
    storeSlug: store.slug,
    summary: `${customer.username} kayıt oldu`,
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
          ? "Doğrulama kodu e-postanıza gönderildi."
          : "Doğrulama kaydı oluşturuldu ancak e-posta gönderilemedi. Yöneticiye bildirin.",
      data: { username: customer.username, verificationId: challenge.id, email },
    };
  }

  await signCustomer(store.id, store.slug, customer);
  return { ok: true, message: "Hesabınız oluşturuldu.", data: { username: customer.username } };
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
  await ensureDatabase();
  const slug = slugRaw.trim().toLowerCase();
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };

  const outcome = await consumeVerification(identifier, code);
  if (!outcome.ok) return { ok: false, message: outcome.message };
  if (outcome.storeId !== store.id) return { ok: false, message: "Bu kod bu mağaza için geçerli değil." };
  if (!outcome.customerId) return { ok: false, message: "Doğrulama kaydı bir hesaba bağlı değil." };

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, outcome.customerId), eq(customers.storeId, store.id)))
    .limit(1);
  const customer = rows[0];
  if (!customer) return { ok: false, message: "Hesap bulunamadı." };
  if (customer.status === "banned") return { ok: false, message: "Hesabınız yasaklanmış." };

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
    summary: `${customer.username} e-postasını doğruladı`,
  });

  return { ok: true, message: "E-posta doğrulandı, giriş yapıldı.", data: { redirectTo: `/${store.slug}/kutuphane` } };
}

/** Re-sends a fresh 6-digit code for a pending registration. */
export async function resendCustomerVerification(
  slugRaw: string,
  emailRaw: string,
): Promise<ActionResult<{ verificationId: number }>> {
  await ensureDatabase();
  const slug = slugRaw.trim().toLowerCase();
  const email = emailRaw.trim();
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Geçerli bir e-posta girin." };

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.storeId, store.id), sql`lower(${customers.email}) = ${email.toLowerCase()}`))
    .limit(1);
  const customer = rows[0];
  if (!customer) return { ok: false, message: "Bu e-posta ile kayıtlı bir hesap yok." };

  const gate = hitRateLimit(`resend:${store.id}:${email.toLowerCase()}`, 3, 300_000);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla kod isteği. ${gate.retryInSeconds} saniye sonra deneyin.` };
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
    message: "Yeni doğrulama kodu gönderildi.",
    data: { verificationId: challenge.id },
  };
}

export async function customerLogin(formData: FormData): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };
  if (!username || !password) return { ok: false, message: "Kullanıcı adı ve şifre zorunludur." };

  const gate = hitRateLimit(`cu:${slug}:${username.toLowerCase()}`);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla deneme. ${gate.retryInSeconds} saniye tekrar deneyin.` };
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
      summary: `Başarısız müşteri girişi (${store.slug}): ${username.slice(0, 60)}`,
      severity: "warn",
      storeId: store.id,
      storeSlug: store.slug,
      actorType: "system",
      actorName: username.slice(0, 60),
      metadata: { reason: "invalid_credentials" },
    });
    return { ok: false, message: "Kullanıcı adı veya şifre hatalı." };
  }
  if (customer.status === "banned") {
    return { ok: false, message: "Hesabınız mağaza yöneticisi tarafından yasaklandı." };
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
      message: "E-posta adresiniz doğrulanmamış. Yeni bir doğrulama kodu gönderdik.",
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
    summary: `${customer.username} müşteri olarak giriş yaptı`,
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
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  await logAudit({ action: "auth.logout", entity: "customer", summary: "Müşteri çıkış yaptı", storeSlug: slug });
  await clearSessionCookie(CUSTOMER_COOKIE);
  if (slug) revalidatePath(`/${slug}`, "layout");
  return { ok: true, redirectTo: `/${slug}` };
}

export async function updateCustomerProfile(
  formData: FormData,
): Promise<ActionResult<{ username: string }>> {
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const store = await loadStore(slug);
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };

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
  if (!current) return { ok: false, message: "Oturum bulunamadı." };
  if (current.status === "banned") return { ok: false, message: "Hesabınız yasaklı durumda." };

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const currentPassword = String(formData.get("currentPassword") ?? "");

  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return { ok: false, message: "Kullanıcı adı 3-24 karakter olmalıdır." };
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
    if (exists.length > 0) return { ok: false, message: "Bu kullanıcı adı bu mağazada zaten kullanılıyor." };
  }
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: "Geçerli bir e-posta girin." };
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) return { ok: false, message: "Profil fotoğrafı adresi http(s) ile başlamalıdır." };
  let passwordHash = current.passwordHash;
  if (newPassword) {
    if (newPassword.length < 6) return { ok: false, message: "Yeni şifre en az 6 karakter olmalıdır." };
    if (!verifyPassword(currentPassword, current.passwordHash)) {
      return { ok: false, message: "Mevcut şifreniz hatalı." };
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
    })
    .where(eq(customers.id, current.id));

  await signCustomer(store.id, store.slug, { id: current.id, username });
  return { ok: true, message: "Profil güncellendi.", data: { username } };
}

/** Frees accounts whose delivery window has ended before rendering storefront data. */
export async function sweepStoreExpired(slug: string): Promise<void> {
  const store = await loadStore(slug);
  if (!store) return;
  await sweepExpiredEntitlements(store.id);
}
