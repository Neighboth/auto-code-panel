"use server";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { promises as dns } from "node:dns";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  accounts,
  codes,
  entitlements,
  games,
  storeAdmins,
  stores,
} from "@/db/schema";
import { generateRedeemCode, verifyPassword, hashPassword } from "@/lib/crypto";
import { decryptData, encryptData } from "@/lib/secret-crypto";
import {
  domainTxtRecordName,
  domainVerificationToken,
  isValidDomain,
  normalizeDomain,
} from "@/lib/domain";
import { PLATFORM_PRESETS, FONT_OPTIONS } from "@/lib/fonts";
import { parsePrice, RESERVED_SLUGS, slugify, convertPrice } from "@/lib/format";
import { fetchSteamAppDetails, parseSteamAppId, syncSteamGames } from "@/lib/steam";
import { hitRateLimit } from "@/lib/rate-limit";
import { accountQuota, requireStoreAdmin } from "@/lib/tenant";
import { isValidSteamSecret, isValidTotpSecret } from "@/lib/totp";
import type { ActionResult, SteamPreview } from "@/lib/types";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function intOrNull(value: string): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function parseIdList(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => Number(value)).filter((value) => Number.isInteger(value));
  } catch {
    return [];
  }
}

function refreshStore(slug: string) {
  revalidatePath(`/${slug}`, "layout");
  revalidatePath(`/${slug}/admin`, "layout");
}

/* ------------------------------- Steam ------------------------------- */

export async function steamLookup(url: string): Promise<ActionResult<SteamPreview>> {
  const appId = parseSteamAppId(url);
  if (!appId) {
    return {
      ok: false,
      message: "Steam linkinden appId okunamadı. Örnek: store.steampowered.com/app/1091500",
    };
  }
  const details = await fetchSteamAppDetails(appId);
  if (!details) {
    return {
      ok: false,
      message:
        "Steam Store API yanıt vermedi. Başlık, kapak ve fiyatı manuel girebilirsiniz; otomatik senkronizasyon daha sonra tekrar denenecek.",
    };
  }
  return {
    ok: true,
    message: "Steam bilgileri alındı.",
    data: {
      appId,
      title: details.title,
      headerImage: details.headerImage,
      shortDescription: details.shortDescription,
      originalPrice: details.originalPrice,
      currency: details.currency,
    },
  };
}

/* ------------------------------- Games ------------------------------- */

export async function saveGame(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const { store } = guard.state;

  const id = intOrNull(str(formData, "id"));
  const titleInput = str(formData, "title");
  const steamUrl = str(formData, "steamUrl");
  const autoSync = formData.get("autoSync") === "on" || formData.get("autoSync") === "true";
  let title = titleInput;
  let coverImage = str(formData, "coverImage");
  let originalPrice = parsePrice(formData.get("originalPrice"));
  const currency = str(formData, "currency") || "TRY";
  let originalCurrency = str(formData, "originalCurrency") || currency;
  let description = str(formData, "description");
  const ourPrice = parsePrice(formData.get("ourPrice")) ?? "0.00";
  const salesUrl = str(formData, "salesUrl");
  let steamAppId = parseSteamAppId(str(formData, "steamAppId") || steamUrl);

  if (steamUrl && (!title || !coverImage || !originalPrice)) {
    const details = steamAppId ? await fetchSteamAppDetails(steamAppId) : null;
    if (details) {
      title = title || details.title;
      coverImage = coverImage || details.headerImage;
      originalPrice =
        originalPrice ?? (details.originalPrice !== null ? convertPrice(details.originalPrice, details.currency, currency) : null);
      originalCurrency = details.originalPrice !== null ? currency : details.currency;
      description = description || details.shortDescription;
      steamAppId = details.appId;
    }
  }

  if (!title) return { ok: false, message: "Ürün başlığı zorunludur (veya Steam linki girin)." };
  if (salesUrl && !/^https?:\/\//i.test(salesUrl)) {
    return { ok: false, message: "Satış ilan linki http(s) ile başlamalıdır." };
  }
  if (steamUrl && !/^https?:\/\//i.test(steamUrl)) {
    return { ok: false, message: "Steam linki http(s) ile başlamalıdır." };
  }

  const payload = {
    title,
    description,
    salesUrl,
    steamUrl,
    steamAppId,
    originalPrice,
    originalCurrency,
    ourPrice,
    currency,
    coverImage,
    autoSync,
    updatedAt: new Date(),
  };

  if (id) {
    const updated = await db
      .update(games)
      .set(payload)
      .where(and(eq(games.id, id), eq(games.storeId, store.id)))
      .returning({ id: games.id });
    if (updated.length === 0) return { ok: false, message: "Ürün bulunamadı." };
    refreshStore(slug);
    return { ok: true, message: "Ürün güncellendi.", data: { id } };
  }

  const [created] = await db
    .insert(games)
    .values({ ...payload, storeId: store.id })
    .returning({ id: games.id });
  refreshStore(slug);
  return { ok: true, message: "Ürün eklendi.", data: { id: created.id } };
}

export async function deleteGame(formData: FormData): Promise<ActionResult> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const id = intOrNull(str(formData, "id"));
  if (!id) return { ok: false, message: "Ürün bulunamadı." };

  const storeCodes = await db
    .select({ id: codes.id, gameIds: codes.gameIds })
    .from(codes)
    .where(eq(codes.storeId, guard.state.store.id));
  const codeRows = storeCodes.filter((row) => (row.gameIds ?? []).includes(id));
  if (codeRows.length > 0) {
    return {
      ok: false,
      message: "Bu ürüne bağlı kodlar var. Önce ilgili kodları silin veya ürünü pasife alın.",
    };
  }

  await db.delete(games).where(and(eq(games.id, id), eq(games.storeId, guard.state.store.id)));
  refreshStore(slug);
  return { ok: true, message: "Ürün silindi." };
}

export async function syncSteamNow(formData: FormData): Promise<ActionResult<{ updated: number }>> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const result = await syncSteamGames(guard.state.store.id);
  refreshStore(slug);
  if (result.checked === 0) {
    return { ok: false, message: "Senkronizasyon açık ve Steam linki olan ürün bulunamadı." };
  }
  return {
    ok: true,
    message: `${result.updated}/${result.checked} ürün güncellendi${result.failed ? `, ${result.failed} hata` : ""}.`,
    data: { updated: result.updated },
  };
}

/* ------------------------------ Accounts ----------------------------- */

export async function saveAccount(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const { store } = guard.state;

  const id = intOrNull(str(formData, "id"));
  const platform = str(formData, "platform").toLowerCase() || "steam";
  const preset = PLATFORM_PRESETS.find((item) => item.id === platform);
  if (!preset) return { ok: false, message: "Geçersiz platform." };

  const customLabel = str(formData, "platformLabel");
  const platformLabel = platform === "custom" ? customLabel : preset.label;
  if (!platformLabel) return { ok: false, message: "Özel platform adı zorunludur." };

  const username = str(formData, "username");
  const email = str(formData, "email");
  const password = str(formData, "password");
  const productLabel = str(formData, "productLabel");
  const guardType = str(formData, "guardType") || "none";

  let existingAccount: typeof accounts.$inferSelect | null = null;
  if (id) {
    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.storeId, store.id)))
      .limit(1);
    existingAccount = rows[0] ?? null;
    if (!existingAccount) return { ok: false, message: "Hesap bulunamadı." };
  }
  // Blank secret fields on edit keep the previously stored secret intact.
  const steamSecret = str(formData, "steamSecret") || existingAccount?.steamSecret || "";
  const totpSecret = str(formData, "totpSecret") || existingAccount?.totpSecret || "";
  const mailEmail = str(formData, "mailEmail");
  const mailPassword = str(formData, "mailPassword");
  const notes = str(formData, "notes");
  const linkedGameIdsRaw = parseIdList(str(formData, "linkedGameIds"));

  if (!password) return { ok: false, message: "Şifre zorunludur." };

  if (platform === "steam") {
    if (!username) return { ok: false, message: "Steam hesabı için kullanıcı adı zorunludur." };
    if (!["steam_guard", "none"].includes(guardType)) {
      return { ok: false, message: "Steam için geçersiz Guard türü." };
    }
    if (guardType === "steam_guard" && !steamSecret) {
      return { ok: false, message: "Steam Guard aktif ise shared_secret zorunludur." };
    }
    if (guardType === "steam_guard" && !isValidSteamSecret(steamSecret)) {
      return {
        ok: false,
        message:
          "Steam Guard shared_secret geçersiz. Steam Desktop Authenticator'daki base64 shared_secret değerini girin.",
      };
    }
  } else {
    if (!username && !email) {
      return { ok: false, message: "Kullanıcı adı veya e-posta adresinden en az biri zorunludur." };
    }
    if (!["totp", "none"].includes(guardType)) {
      return { ok: false, message: "Geçersiz 2FA türü." };
    }
    if (guardType === "totp") {
      if (!totpSecret) return { ok: false, message: "2FA secret key zorunludur." };
      if (!isValidTotpSecret(totpSecret)) {
        return { ok: false, message: "2FA secret key geçersiz. Base32 formatında olmalıdır." };
      }
    }
  }

  const storeGames = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.storeId, store.id));
  const validGameIds = new Set(storeGames.map((game) => game.id));
  const linkedGameIds = linkedGameIdsRaw.filter((gameId) => validGameIds.has(gameId));

  if (platform === "steam" && linkedGameIds.length === 0) {
    return {
      ok: false,
      message: "Steam hesabına en az bir oyun bağlamalısınız (oyunlar önce eklenmelidir).",
    };
  }

  // Secrets are stored AES-GCM encrypted; decryptData/encryptData are idempotent for legacy rows.
  const payload = {
    platform,
    platformLabel,
    username: username || null,
    email: email || null,
    password: encryptData(password),
    productLabel,
    linkedGameIds,
    guardType,
    steamSecret: guardType === "steam_guard" ? encryptData(steamSecret) : null,
    totpSecret: guardType === "totp" ? encryptData(totpSecret.toUpperCase()) : null,
    mailEmail: mailEmail || null,
    mailPassword: mailPassword ? encryptData(mailPassword) : null,
    notes,
    updatedAt: new Date(),
  };

  if (id) {
    const updated = await db
      .update(accounts)
      .set(payload)
      .where(and(eq(accounts.id, id), eq(accounts.storeId, store.id)))
      .returning({ id: accounts.id });
    if (updated.length === 0) return { ok: false, message: "Hesap bulunamadı." };
    refreshStore(slug);
    return { ok: true, message: "Hesap güncellendi.", data: { id } };
  }

  const quota = await accountQuota(store);
  if (quota.reached) {
    return {
      ok: false,
      message: `Hesap limitiniz dolu (${quota.used}/${quota.max}). Bayilik paketinizi yükseltmeden yeni hesap ekleyemezsiniz.`,
    };
  }

  const [created] = await db
    .insert(accounts)
    .values({ ...payload, storeId: store.id, status: "available" })
    .returning({ id: accounts.id });
  refreshStore(slug);
  return { ok: true, message: "Hesap envantere eklendi.", data: { id: created.id } };
}

export async function deleteAccount(formData: FormData): Promise<ActionResult> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const id = intOrNull(str(formData, "id"));
  if (!id) return { ok: false, message: "Hesap bulunamadı." };

  const entitlementRows = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.storeId, guard.state.store.id), eq(entitlements.accountId, id)));
  const active = entitlementRows.filter((row) => !row.expiresAt || new Date(row.expiresAt).getTime() > Date.now());
  if (active.length > 0) {
    return { ok: false, message: "Bu hesap aktif bir teslimatta kullanılıyor, silinemez." };
  }

  await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.storeId, guard.state.store.id)));
  refreshStore(slug);
  return { ok: true, message: "Hesap silindi." };
}

export async function setAccountStatus(formData: FormData): Promise<ActionResult> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const id = intOrNull(str(formData, "id"));
  const status = str(formData, "status");
  if (!id || !["available", "retired"].includes(status)) {
    return { ok: false, message: "Geçersiz istek." };
  }
  await db
    .update(accounts)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.storeId, guard.state.store.id)));
  refreshStore(slug);
  return { ok: true, message: status === "retired" ? "Hesap pasife alındı." : "Hesap aktifleştirildi." };
}

/* -------------------------------- Codes ------------------------------ */

export type CodeWizardPayload = {
  slug: string;
  type: "choice" | "single" | "bundle";
  choiceCount: number;
  durationMinutes: number | null;
  gameIds: number[];
  accountIds: number[];
  count: number;
  label: string;
};

export async function createCodes(
  payload: CodeWizardPayload,
): Promise<ActionResult<{ codes: string[] }>> {
  const guard = await requireStoreAdmin(payload.slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const { store } = guard.state;

  if (!["choice", "single", "bundle"].includes(payload.type)) {
    return { ok: false, message: "Geçersiz kod türü." };
  }
  const count = Math.min(500, Math.max(1, Math.trunc(payload.count || 1)));
  const choiceCount = Math.min(20, Math.max(1, Math.trunc(payload.choiceCount || 1)));
  const durationMinutes =
    payload.durationMinutes === null || payload.durationMinutes === undefined
      ? null
      : Math.max(1, Math.trunc(payload.durationMinutes));

  let gameIds = payload.gameIds ?? [];
  let accountIds = payload.accountIds ?? [];

  if (payload.type === "choice") {
    gameIds = [];
    accountIds = [];
    const gameCount = await db
      .select({ value: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.storeId, store.id));
    if (Number(gameCount[0]?.value ?? 0) === 0) {
      return { ok: false, message: "Seçmeli kod için önce mağazaya oyun eklemelisiniz." };
    }
  } else {
    if (gameIds.length + accountIds.length === 0) {
      return { ok: false, message: "En az bir ürün, oyun veya hesap seçmelisiniz." };
    }
    if (payload.type === "single" && gameIds.length + accountIds.length !== 1) {
      return { ok: false, message: "Tekli modda yalnızca 1 hedef seçilebilir." };
    }
    const validGames = await db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.storeId, store.id), gameIds.length ? inArray(games.id, gameIds) : sql`false`));
    const validAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.storeId, store.id), accountIds.length ? inArray(accounts.id, accountIds) : sql`false`),
      );
    gameIds = validGames.map((game) => game.id);
    accountIds = validAccounts.map((account) => account.id);
    if (gameIds.length + accountIds.length === 0) {
      return { ok: false, message: "Seçilen hedefler bu mağazada bulunamadı." };
    }
  }

  const generated = new Set<string>();
  let attempts = 0;
  while (generated.size < count && attempts < 6) {
    attempts += 1;
    const batch = Array.from({ length: count - generated.size }, () => generateRedeemCode());
    const existing = await db
      .select({ code: codes.code })
      .from(codes)
      .where(inArray(codes.code, batch));
    const existingSet = new Set(existing.map((row) => row.code));
    for (const code of batch) {
      if (!existingSet.has(code)) generated.add(code);
    }
  }
  if (generated.size === 0) {
    return { ok: false, message: "Kod üretilemedi, lütfen tekrar deneyin." };
  }

  const values = Array.from(generated).map((code) => ({
    storeId: store.id,
    code,
    type: payload.type,
    choiceCount,
    durationMinutes,
    gameIds,
    accountIds,
    label: payload.label?.slice(0, 120) || "",
  }));

  const inserted = await db.insert(codes).values(values).returning({ code: codes.code });
  refreshStore(payload.slug);
  return {
    ok: true,
    message: `${inserted.length} kod üretildi.`,
    data: { codes: inserted.map((row) => row.code) },
  };
}

export async function deleteCode(formData: FormData): Promise<ActionResult> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const id = intOrNull(str(formData, "id"));
  if (!id) return { ok: false, message: "Kod bulunamadı." };
  const rows = await db
    .select({ redeemedAt: codes.redeemedAt })
    .from(codes)
    .where(and(eq(codes.id, id), eq(codes.storeId, guard.state.store.id)))
    .limit(1);
  if (rows.length === 0) return { ok: false, message: "Kod bulunamadı." };
  if (rows[0].redeemedAt) {
    return { ok: false, message: "Kullanılmış kodlar silinemez, arşiv olarak saklanır." };
  }
  await db.delete(codes).where(and(eq(codes.id, id), eq(codes.storeId, guard.state.store.id)));
  refreshStore(slug);
  return { ok: true, message: "Kod silindi." };
}

/* ------------------------------ Settings ----------------------------- */

export async function saveStoreSettings(formData: FormData): Promise<ActionResult<{ slug: string }>> {
  const currentSlug = str(formData, "slug");
  const guard = await requireStoreAdmin(currentSlug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const { store } = guard.state;

  const nextSlug = slugify(str(formData, "newSlug") || currentSlug);
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(nextSlug)) {
    return { ok: false, message: "Mağaza ID 3-30 karakter olmalıdır." };
  }
  if (RESERVED_SLUGS.has(nextSlug)) {
    return { ok: false, message: "Bu mağaza ID ayrılmış durumda." };
  }
  if (nextSlug !== store.slug) {
    const taken = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, nextSlug)).limit(1);
    if (taken.length > 0) return { ok: false, message: "Bu mağaza ID zaten kullanılıyor." };
  }

  const title = str(formData, "title") || store.title;
  const subtitle = str(formData, "subtitle");
  const announcement = str(formData, "announcement");
  const footerText = str(formData, "footerText");
  const logoUrl = str(formData, "logoUrl");
  const faviconUrl = str(formData, "faviconUrl");
  const primaryColor = str(formData, "primaryColor") || store.primaryColor;
  const accentColor = str(formData, "accentColor") || store.accentColor;
  const fontFamily = str(formData, "fontFamily") || store.fontFamily;

  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
    return { ok: false, message: "Logo adresi http(s) ile başlamalıdır." };
  }
  if (faviconUrl && !/^https?:\/\//i.test(faviconUrl)) {
    return { ok: false, message: "Favicon adresi http(s) ile başlamalıdır." };
  }
  if (!FONT_OPTIONS.some((option) => option.family === fontFamily)) {
    return { ok: false, message: "Desteklenmeyen font seçimi." };
  }

  let contactLinks: { label: string; url: string }[] = [];
  try {
    const parsed = JSON.parse(str(formData, "contactLinks") || "[]") as unknown;
    if (Array.isArray(parsed)) {
      contactLinks = parsed
        .filter(
          (item): item is { label: string; url: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { label?: unknown }).label === "string" &&
            typeof (item as { url?: unknown }).url === "string",
        )
        .map((item) => ({ label: item.label.slice(0, 30), url: item.url.slice(0, 200) }))
        .filter((item) => item.label && /^(https?:\/\/|mailto:)/i.test(item.url))
        .slice(0, 6);
    }
  } catch {
    contactLinks = store.contactLinks;
  }

  await db
    .update(stores)
    .set({
      slug: nextSlug,
      title,
      subtitle,
      announcement,
      footerText,
      logoUrl,
      faviconUrl,
      primaryColor,
      accentColor,
      fontFamily,
      contactLinks,
      updatedAt: new Date(),
    })
    .where(eq(stores.id, store.id));

  revalidatePath(`/${store.slug}`, "layout");
  revalidatePath(`/${nextSlug}`, "layout");
  revalidatePath(`/${nextSlug}/admin`, "layout");
  return {
    ok: true,
    message: nextSlug !== store.slug ? "Ayarlar kaydedildi, mağaza ID güncellendi." : "Ayarlar kaydedildi.",
    data: { slug: nextSlug },
  };
}

/* ------------------------------- Domain ------------------------------ */

export async function saveStoreDomain(
  formData: FormData,
): Promise<ActionResult<{ domain: string; token: string }>> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const { store } = guard.state;

  const raw = str(formData, "domain");
  if (!raw) {
    await db
      .update(stores)
      .set({ customDomain: null, customDomainVerifiedAt: null, updatedAt: new Date() })
      .where(eq(stores.id, store.id));
    revalidatePath(`/${store.slug}`, "layout");
    revalidatePath(`/${store.slug}/admin`, "layout");
    return { ok: true, message: "Özel alan adı kaldırıldı.", data: { domain: "", token: "" } };
  }

  const domain = normalizeDomain(raw);
  if (!isValidDomain(domain)) {
    return {
      ok: false,
      message: "Geçerli bir alan adı girin. Örnek: magazadi.com (protokol, port ve yol olmadan).",
    };
  }

  const taken = await db
    .select({ id: stores.id })
    .from(stores)
    .where(
      and(
        eq(stores.customDomain, domain),
        isNotNull(stores.customDomainVerifiedAt),
        ne(stores.id, store.id),
      ),
    )
    .limit(1);
  if (taken.length > 0) {
    return { ok: false, message: "Bu alan adı başka bir mağaza tarafından doğrulanmış." };
  }

  const unchanged = domain === store.customDomain;
  try {
    await db
      .update(stores)
      .set({
        customDomain: domain,
        customDomainVerifiedAt: unchanged ? store.customDomainVerifiedAt : null,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, store.id));
  } catch {
    return { ok: false, message: "Bu alan adı başka bir mağazaya bağlı." };
  }

  revalidatePath(`/${store.slug}`, "layout");
  revalidatePath(`/${store.slug}/admin`, "layout");
  return {
    ok: true,
    message: unchanged
      ? `${domain} zaten kayıtlı.`
      : `${domain} kaydedildi. Şimdi DNS TXT kaydını ekleyip doğrulayın.`,
    data: { domain, token: domainVerificationToken(store.id, domain) },
  };
}

export async function verifyStoreDomain(formData: FormData): Promise<ActionResult> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };

  const gate = hitRateLimit(`domain-verify:${guard.state.store.id}`, 10, 60_000);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla doğrulama denemesi. ${gate.retryInSeconds} saniye sonra tekrar deneyin.` };
  }

  const rows = await db.select().from(stores).where(eq(stores.id, guard.state.store.id)).limit(1);
  const store = rows[0];
  if (!store?.customDomain) {
    return { ok: false, message: "Önce bir alan adı kaydedin." };
  }

  const domain = store.customDomain;
  const recordName = domainTxtRecordName(domain);
  const expected = domainVerificationToken(store.id, domain);

  const conflict = await db
    .select({ id: stores.id })
    .from(stores)
    .where(
      and(
        eq(stores.customDomain, domain),
        isNotNull(stores.customDomainVerifiedAt),
        ne(stores.id, store.id),
      ),
    )
    .limit(1);
  if (conflict.length > 0) {
    return {
      ok: false,
      message: "Bu alan adı başka bir mağaza tarafından doğrulanmış. Lütfen farklı bir alan adı kullanın.",
    };
  }

  let records: string[][];
  try {
    records = await Promise.race([
      dns.resolveTxt(recordName),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          const error = new Error("DNS zaman aşımı");
          (error as NodeJS.ErrnoException).code = "ETIMEOUT";
          reject(error);
        }, 5000),
      ),
    ]);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") {
      return {
        ok: false,
        message: `${recordName} için TXT kaydı bulunamadı. DNS yayılımı birkaç dakika sürebilir, tekrar deneyin.`,
      };
    }
    return {
      ok: false,
      message: "DNS sorgusu tamamlanamadı. Alan adının yayında olduğundan ve sunucunun dış DNS sorgusu yapabildiğinden emin olun.",
    };
  }

  const values = records.map((chunks) => chunks.join("").trim());
  if (!values.includes(expected)) {
    return {
      ok: false,
      message: `${recordName} TXT kaydı bulundu ancak değer eşleşmiyor. Beklenen değer: ${expected}`,
    };
  }

  try {
    await db
      .update(stores)
      .set({ customDomainVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(stores.id, store.id));
  } catch {
    return {
      ok: false,
      message: "Bu alan adı başka bir mağaza tarafından doğrulanmış. Lütfen farklı bir alan adı kullanın.",
    };
  }

  revalidatePath(`/${store.slug}`, "layout");
  revalidatePath(`/${store.slug}/admin`, "layout");
  return {
    ok: true,
    message: `${domain} doğrulandı. Alan adı birkaç saniye içinde mağazanıza yönlenecek.`,
  };
}

export async function saveStoreCredentials(formData: FormData): Promise<ActionResult> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const username = str(formData, "username");
  const email = str(formData, "email");
  const currentPassword = str(formData, "currentPassword");
  const newPassword = str(formData, "newPassword");

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, message: "Yönetici kullanıcı adı 3-32 karakter olmalıdır." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: "Geçerli bir e-posta girin." };
  }
  const rows = await db
    .select()
    .from(storeAdmins)
    .where(and(eq(storeAdmins.id, guard.session.adminId), eq(storeAdmins.storeId, guard.state.store.id)))
    .limit(1);
  const admin = rows[0];
  if (!admin) return { ok: false, message: "Yönetici bulunamadı." };

  let passwordHash = admin.passwordHash;
  if (newPassword) {
    if (!verifyPassword(currentPassword, admin.passwordHash)) {
      return { ok: false, message: "Mevcut şifre hatalı." };
    }
    if (newPassword.length < 6) return { ok: false, message: "Yeni şifre en az 6 karakter olmalıdır." };
    passwordHash = hashPassword(newPassword);
  }

  await db
    .update(storeAdmins)
    .set({ username, email, passwordHash })
    .where(eq(storeAdmins.id, admin.id));

  return { ok: true, message: "Yönetici bilgileri güncellendi." };
}
