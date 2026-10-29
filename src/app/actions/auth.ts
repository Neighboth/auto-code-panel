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
): Promise<{ totp: boolean; passkey: boolean; question: boolean }> {
  const rows = await db
    .select({ kind: securityFactors.kind })
    .from(securityFactors)
    .where(and(eq(securityFactors.subjectType, subjectType), eq(securityFactors.subjectId, subjectId)));
  const kinds = new Set(rows.map((row) => row.kind));
  return { totp: kinds.has("totp"), passkey: kinds.has("passkey"), question: kinds.has("question") };
}

type PendingInput =
  | { t: "super"; id: number; username: string }
  | { t: "store"; id: number; storeId: number; slug: string; username: string }
  | { t: "customer"; id: number; storeId: number; slug: string; username: string };

async function startPendingOrSession(subject: PendingInput, redirectTo: string): Promise<ActionResult> {
  const methods = await factorMethods(subject.t, subject.id);
  if (!methods.totp && !methods.passkey && !methods.question) {
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
    return { ok: false, message: "Kullanıcı adı, e-posta veya şifre hatalı." };
  }
  if (matches.length > 1) {
    return { ok: false, message: "Bu bilgiler birden fazla hesapta eşleşiyor. Lütfen tekrar deneyin." };
  }

  const { admin, store } = matches[0];
  recordSuccess(`mgr:${identifier}`);
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
    const createdStoreId = await db.transaction(async (tx) => {
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

      return store.id;
    });

    const adminRows = await db
      .select()
      .from(storeAdmins)
      .where(eq(storeAdmins.storeId, createdStoreId))
      .limit(1);

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
    return { ok: false, message: "Kullanıcı adı veya şifre hatalı." };
  }
  recordSuccess(`st:${slug}:${identifier}`);
  return startPendingOrSession(
    { t: "store", id: admin.id, storeId: store.id, slug: store.slug, username: admin.username },
    `/${store.slug}/admin`,
  );
}

export async function storeAdminLogout(slug: string): Promise<ActionResult> {
  await clearSessionCookie(STORE_COOKIE);
  return { ok: true, redirectTo: `/${slug}/admin/giris` };
}

export async function superAdminLogout(): Promise<ActionResult> {
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

export async function customerRegister(formData: FormData): Promise<ActionResult<{ username: string }>> {
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
    })
    .returning();

  await signCustomer(store.id, store.slug, customer);
  return { ok: true, message: "Hesabınız oluşturuldu.", data: { username: customer.username } };
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
    return { ok: false, message: "Kullanıcı adı veya şifre hatalı." };
  }
  if (customer.status === "banned") {
    return { ok: false, message: "Hesabınız mağaza yöneticisi tarafından yasaklandı." };
  }
  recordSuccess(`cu:${slug}:${username.toLowerCase()}`);
  return startPendingOrSession(
    { t: "customer", id: customer.id, storeId: store.id, slug: store.slug, username: customer.username },
    `/${store.slug}/kutuphane`,
  );
}

export async function customerLogout(formData: FormData): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
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
