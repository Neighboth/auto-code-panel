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
import {
  FONT_OPTIONS,
  PLATFORM_PRESETS,
  guardHasEmail,
  guardHasSteam,
  guardHasTotp,
  GUARD_OPTIONS,
} from "@/lib/fonts";
import { parsePrice, RESERVED_SLUGS, slugify } from "@/lib/format";
import { convertAmount, convertWithRates, getUsdRates } from "@/lib/currency";
import { MAIL_PRESETS, resolveMailPreset } from "@/lib/imap";
import { managerIdentifierError } from "@/lib/admin-guard";
import { fetchSteamAppDetails, parseSteamAppId, syncSteamGames } from "@/lib/steam";
import { hitRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { accountQuota, requireStoreAdmin } from "@/lib/tenant";
import { generateSteamGuardCode, generateTotpCode, isValidSteamSecret, isValidTotpSecret, secondsRemaining } from "@/lib/totp";
import { fetchLatestMailCode } from "@/lib/imap";
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

export async function steamLookup(
  url: string,
  targetCurrency = "TRY",
): Promise<ActionResult<SteamPreview>> {
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
  const converted =
    details.originalPrice === null
      ? null
      : await convertAmount(details.originalPrice, details.currency, targetCurrency);
  return {
    ok: true,
    message:
      details.currency.toUpperCase() === targetCurrency.toUpperCase()
        ? "Steam bilgileri alındı."
        : `Steam bilgileri alındı · ${details.currency} → ${targetCurrency} dönüştürüldü.`,
    data: {
      appId,
      title: details.title,
      headerImage: details.headerImage,
      shortDescription: details.shortDescription,
      originalPrice: converted !== null ? Number(converted) : null,
      currency: targetCurrency,
      sourceCurrency: details.currency,
      sourcePrice: details.originalPrice,
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
      if (originalPrice === null && details.originalPrice !== null) {
        const converted = await convertAmount(details.originalPrice, details.currency, currency);
        originalPrice = converted ?? details.originalPrice.toFixed(2);
        originalCurrency = currency;
      }
      description = description || details.shortDescription;
      steamAppId = details.appId;
    }
  }

  // Whatever currency the price arrived in, it is stored in the store currency.
  if (originalPrice !== null) {
    const normalized = await convertAmount(originalPrice, originalCurrency, currency);
    if (normalized !== null) originalPrice = normalized;
  }
  originalCurrency = currency;

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
    await logAudit({
      action: "store.product.update",
      entity: "game",
      entityId: id,
      summary: `${title} ürünü güncellendi`,
      storeId: store.id,
      storeSlug: slug,
      metadata: { title, ourPrice, currency, steamAppId },
    });
    return { ok: true, message: "Ürün güncellendi.", data: { id } };
  }

  const [created] = await db
    .insert(games)
    .values({ ...payload, storeId: store.id })
    .returning({ id: games.id });
  refreshStore(slug);
  await logAudit({
    action: "store.product.create",
    entity: "game",
    entityId: created.id,
    summary: `${title} ürünü eklendi`,
    storeId: store.id,
    storeSlug: slug,
    metadata: { title, ourPrice, currency, steamAppId, originalPrice },
  });
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
  await logAudit({
    action: "store.product.delete",
    entity: "game",
    entityId: id,
    summary: "Ürün silindi",
    severity: "warn",
    storeId: guard.state.store.id,
    storeSlug: slug,
  });
  return { ok: true, message: "Ürün silindi." };
}

export async function syncSteamNow(formData: FormData): Promise<ActionResult<{ updated: number }>> {
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const result = await syncSteamGames(guard.state.store.id);
  refreshStore(slug);
  await logAudit({
    action: "store.product.sync",
    entity: "store",
    entityId: guard.state.store.id,
    summary: `Steam senkronizasyonu: ${result.updated}/${result.checked} ürün güncellendi`,
    storeId: guard.state.store.id,
    storeSlug: slug,
    metadata: { checked: result.checked, updated: result.updated, failed: result.failed },
  });
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
  if (!GUARD_OPTIONS.some((option) => option.id === guardType)) {
    return { ok: false, message: "Geçersiz koruma türü seçildi." };
  }

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
  const mailPassword = str(formData, "mailPassword") || existingAccount?.mailPassword || "";
  const mailProvider = str(formData, "mailProvider") || existingAccount?.mailProvider || "gmail";
  const mailHost = str(formData, "mailHost") || existingAccount?.mailHost || "";
  const mailPort = intOrNull(str(formData, "mailPort")) ?? existingAccount?.mailPort ?? null;
  const mailSenderFilter =
    str(formData, "mailSenderFilter") || existingAccount?.mailSenderFilter || "steam";
  const notes = str(formData, "notes");
  const linkedGameIdsRaw = parseIdList(str(formData, "linkedGameIds"));

  if (!password) return { ok: false, message: "Şifre zorunludur." };
  if (!username && !email) {
    return { ok: false, message: "Kullanıcı adı veya e-posta adresinden en az biri zorunludur." };
  }
  if (preset.kind === "steam" && !username) {
    return { ok: false, message: "Steam hesabı için kullanıcı adı zorunludur." };
  }

  if (guardHasSteam(guardType)) {
    if (!steamSecret) return { ok: false, message: "Steam Guard seçildiği için shared_secret zorunludur." };
    if (!isValidSteamSecret(steamSecret)) {
      return {
        ok: false,
        message:
          "Steam Guard shared_secret geçersiz. Steam Desktop Authenticator'daki base64 shared_secret değerini girin.",
      };
    }
  }
  if (guardHasTotp(guardType)) {
    if (!totpSecret) return { ok: false, message: "2FA (TOTP) seçildiği için secret key zorunludur." };
    if (!isValidTotpSecret(totpSecret)) {
      return { ok: false, message: "2FA secret key geçersiz. Base32 formatında olmalıdır." };
    }
  }
  if (guardHasEmail(guardType)) {
    if (!mailEmail) return { ok: false, message: "E-posta doğrulaması için mail adresi zorunludur." };
    if (!mailPassword) {
      return {
        ok: false,
        message: "E-posta doğrulaması için uygulama şifresi (IMAP) zorunludur.",
      };
    }
    if (!MAIL_PRESETS.some((mail) => mail.id === mailProvider)) {
      return { ok: false, message: "Geçersiz mail sağlayıcısı seçildi." };
    }
  }

  const storeGames = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.storeId, store.id));
  const validGameIds = new Set(storeGames.map((game) => game.id));
  const linkedGameIds = linkedGameIdsRaw.filter((gameId) => validGameIds.has(gameId));

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
    steamSecret: guardHasSteam(guardType) ? encryptData(steamSecret) : null,
    totpSecret: guardHasTotp(guardType) ? encryptData(totpSecret.toUpperCase()) : null,
    mailEmail: mailEmail || null,
    mailPassword: mailEmail && mailPassword ? encryptData(mailPassword) : null,
    mailProvider,
    mailHost: mailHost || null,
    mailPort,
    mailSenderFilter,
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
    await logAudit({
      action: "store.account.update",
      entity: "account",
      entityId: id,
      summary: `${productLabel} hesabı güncellendi`,
      storeId: store.id,
      storeSlug: slug,
      // Never log secrets: only which guard types are configured.
      metadata: { platform, guardType, hasMail: Boolean(mailEmail) },
    });
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
  await logAudit({
    action: "store.account.create",
    entity: "account",
    entityId: created.id,
    summary: `${productLabel} hesabı envantere eklendi`,
    storeId: store.id,
    storeSlug: slug,
    metadata: { platform, guardType, hasMail: Boolean(mailEmail) },
  });
  return { ok: true, message: "Hesap envantere eklendi.", data: { id: created.id } };
}

export type AccessCodeTest = {
  label: string;
  code: string;
  kind: "steam" | "totp" | "email";
  secondsRemaining: number;
};

/**
 * "Test et" button in the account modal: generates the Steam Guard / TOTP code
 * or reads the newest mail code over IMAP before the account is even saved.
 */
export async function testAccessCode(
  slug: string,
  accountId: number | null,
  values: {
    guardType: string;
    steamSecret?: string;
    totpSecret?: string;
    mailEmail?: string;
    mailPassword?: string;
    mailProvider?: string;
    mailHost?: string;
    mailPort?: number | null;
    mailSenderFilter?: string;
  },
): Promise<ActionResult<{ results: AccessCodeTest[] }>> {
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const gate = hitRateLimit(`code-test:${guard.state.store.id}`, 20, 60_000);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla test isteği. ${gate.retryInSeconds} saniye bekleyin.` };
  }

  let stored: typeof accounts.$inferSelect | null = null;
  if (accountId) {
    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.storeId, guard.state.store.id)))
      .limit(1);
    stored = rows[0] ?? null;
  }

  const guardType = values.guardType || "none";
  const results: AccessCodeTest[] = [];

  if (guardHasSteam(guardType)) {
    const secret = values.steamSecret || (stored?.steamSecret ? decryptData(stored.steamSecret) : "");
    if (!secret || !isValidSteamSecret(secret)) {
      return { ok: false, message: "Steam Guard kodu üretilemedi: shared_secret geçersiz veya boş." };
    }
    results.push({
      label: "Steam Guard",
      code: generateSteamGuardCode(secret),
      kind: "steam",
      secondsRemaining: secondsRemaining(),
    });
  }

  if (guardHasTotp(guardType)) {
    const secret = values.totpSecret || (stored?.totpSecret ? decryptData(stored.totpSecret) : "");
    if (!secret || !isValidTotpSecret(secret)) {
      return { ok: false, message: "TOTP kodu üretilemedi: secret key geçersiz veya boş." };
    }
    results.push({
      label: "Authenticator (TOTP)",
      code: generateTotpCode(secret),
      kind: "totp",
      secondsRemaining: secondsRemaining(),
    });
  }

  if (guardHasEmail(guardType)) {
    const email = values.mailEmail || stored?.mailEmail || "";
    const password = values.mailPassword || (stored?.mailPassword ? decryptData(stored.mailPassword) : "");
    const provider = resolveMailPreset(values.mailProvider || stored?.mailProvider || "gmail");
    const host = values.mailHost || stored?.mailHost || provider.host;
    const port = values.mailPort ?? stored?.mailPort ?? provider.port;
    const mail = await fetchLatestMailCode({
      email,
      password,
      host,
      port,
      secure: port === 993,
      senderFilter: values.mailSenderFilter || stored?.mailSenderFilter || "steam",
      sinceMinutes: 120,
    });
    if (!mail.ok) return { ok: false, message: `Mail kodu alınamadı: ${mail.message}` };
    results.push({
      label: `E-posta (${mail.from || email})`,
      code: mail.code,
      kind: "email",
      secondsRemaining: 0,
    });
  }

  if (results.length === 0) {
    return { ok: false, message: "Test edilecek bir koruma yöntemi seçilmedi." };
  }
  return { ok: true, message: "Kod(lar) başarıyla üretildi.", data: { results } };
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
  await logAudit({
    action: "store.account.delete",
    entity: "account",
    entityId: id,
    summary: "Hesap silindi",
    severity: "warn",
    storeId: guard.state.store.id,
    storeSlug: slug,
  });
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
  await logAudit({
    action: "store.account.status",
    entity: "account",
    entityId: id,
    summary: status === "retired" ? "Hesap pasife alındı" : "Hesap aktifleştirildi",
    storeId: guard.state.store.id,
    storeSlug: slug,
    metadata: { status },
  });
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
  await logAudit({
    action: "store.code.create",
    entity: "code",
    summary: `${inserted.length} kod üretildi (${payload.type})`,
    storeId: store.id,
    storeSlug: payload.slug,
    metadata: {
      count: inserted.length,
      type: payload.type,
      choiceCount,
      gameIds,
      accountIds,
      label: payload.label,
    },
  });
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
  await logAudit({
    action: "store.code.delete",
    entity: "code",
    entityId: id,
    summary: "Kod silindi",
    severity: "warn",
    storeId: guard.state.store.id,
    storeSlug: slug,
  });
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
  await logAudit({
    action: "store.settings.update",
    entity: "store",
    entityId: store.id,
    summary:
      nextSlug !== store.slug
        ? `Mağaza ayarları güncellendi, ID ${store.slug} → ${nextSlug}`
        : "Mağaza ayarları güncellendi",
    storeId: store.id,
    storeSlug: nextSlug,
    metadata: { nextSlug, title, fontFamily, contactLinks, logoUrl, primaryColor, accentColor },
  });
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
    await logAudit({
      action: "store.domain.remove",
      entity: "store",
      entityId: store.id,
      summary: `${store.customDomain ?? "Özel alan adı"} kaldırıldı`,
      severity: "warn",
      storeId: store.id,
      storeSlug: store.slug,
    });
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
  await logAudit({
    action: "store.domain.add",
    entity: "store",
    entityId: store.id,
    summary: unchanged ? `${domain} tekrar kaydedildi` : `${domain} özel alan adı olarak kaydedildi`,
    storeId: store.id,
    storeSlug: store.slug,
    metadata: { domain, unchanged },
  });
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
  await logAudit({
    action: "store.domain.verify",
    entity: "store",
    entityId: store.id,
    summary: `${domain} alan adı doğrulandı`,
    storeId: store.id,
    storeSlug: store.slug,
    metadata: { domain, recordName },
  });
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
  const reserved = managerIdentifierError(username, email);
  if (reserved) return { ok: false, message: reserved };
  const duplicate = await db
    .select({ id: storeAdmins.id })
    .from(storeAdmins)
    .where(and(sql`lower(${storeAdmins.username}) = ${username.toLowerCase()}`, ne(storeAdmins.id, guard.session.adminId)))
    .limit(1);
  if (duplicate.length > 0) {
    return { ok: false, message: "Bu yönetici kullanıcı adı platformda zaten kullanılıyor." };
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

  await logAudit({
    action: "store.credentials.update",
    entity: "store_admin",
    entityId: admin.id,
    summary:
      newPassword.length > 0
        ? "Yönetici kullanıcı adı, e-postası ve şifresi güncellendi"
        : "Yönetici kullanıcı adı ve e-postası güncellendi",
    severity: newPassword ? "warn" : "info",
    storeId: guard.state.store.id,
    storeSlug: slug,
    metadata: { username, email, passwordChanged: newPassword.length > 0 },
  });

  return { ok: true, message: "Yönetici bilgileri güncellendi." };
}

/**
 * Bulk code cleanup.
 *
 * Redeemed codes are never deleted (they are the audit trail of a delivery), so
 * they are reported back separately instead of failing the whole batch.
 */
export async function bulkDeleteCodes(
  slug: string,
  ids: number[],
): Promise<ActionResult<{ deleted: number; skipped: number }>> {
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const store = guard.state.store;
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (unique.length === 0) return { ok: false, message: "Seçim yapılmadı." };

  const rows = await db
    .select({ id: codes.id, code: codes.code, redeemedAt: codes.redeemedAt })
    .from(codes)
    .where(and(eq(codes.storeId, store.id), inArray(codes.id, unique)));

  const deletable = rows.filter((row) => !row.redeemedAt).map((row) => row.id);
  const skipped = rows.length - deletable.length;

  if (deletable.length > 0) {
    await db.delete(codes).where(and(eq(codes.storeId, store.id), inArray(codes.id, deletable)));
  }
  refreshStore(slug);

  await logAudit({
    action: "store.code.bulk_delete",
    entity: "code",
    summary: `${deletable.length} kod silindi, ${skipped} kullanılmış kod korundu`,
    severity: "warn",
    storeId: store.id,
    storeSlug: slug,
    metadata: {
      requested: unique.length,
      deleted: deletable.length,
      skipped,
      codes: rows.map((row) => row.code).slice(0, 50),
    },
  });

  return {
    ok: true,
    message: `${deletable.length} kod silindi${skipped ? `, ${skipped} kullanılmış kod korundu` : ""}.`,
    data: { deleted: deletable.length, skipped },
  };
}

/** Bulk price update for products (percentage or absolute delta in store currency). */
export async function bulkUpdateProductPrices(
  slug: string,
  ids: number[],
  mode: "percent" | "amount",
  value: number,
): Promise<ActionResult<{ updated: number }>> {
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const store = guard.state.store;
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (unique.length === 0) return { ok: false, message: "Ürün seçilmedi." };
  if (!Number.isFinite(value) || value === 0) return { ok: false, message: "Geçerli bir değer girin." };
  if (mode === "percent" && (value <= -100 || value > 500)) {
    return { ok: false, message: "Yüzde değeri -99 ile 500 arasında olmalıdır." };
  }

  const rows = await db
    .select({ id: games.id, ourPrice: games.ourPrice, currency: games.currency })
    .from(games)
    .where(and(eq(games.storeId, store.id), inArray(games.id, unique)));

  let updated = 0;
  for (const row of rows) {
    const current = Number(row.ourPrice ?? 0);
    if (!Number.isFinite(current)) continue;
    const next = mode === "percent" ? current * (1 + value / 100) : current + value;
    if (next <= 0) continue;
    await db
      .update(games)
      .set({ ourPrice: next.toFixed(2), updatedAt: new Date() })
      .where(and(eq(games.id, row.id), eq(games.storeId, store.id)));
    updated += 1;
  }
  refreshStore(slug);

  await logAudit({
    action: "store.product.bulk_price",
    entity: "game",
    summary: `${updated} ürünün fiyatı toplu güncellendi (${mode === "percent" ? `${value}%` : `${value}`})`,
    storeId: store.id,
    storeSlug: slug,
    metadata: { mode, value, ids: unique.slice(0, 50), updated },
  });

  return { ok: true, message: `${updated} ürün fiyatı güncellendi.`, data: { updated } };
}

/* ----------------------------- CSV import ---------------------------- */

/** Minimal RFC 4180 parser: handles quoted fields, escaped quotes and CRLF. */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === "," || char === ";") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function csvRecords(csv: string): Record<string, string>[] {
  const [headerRow, ...rest] = parseCsv(csv);
  if (!headerRow) return [];
  const header = headerRow.map((cell) => cell.toLowerCase().replace(/\s+/g, ""));
  return rest.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? "";
    });
    return record;
  });
}

/** Bulk product import from CSV (title,ourPrice,currency,originalPrice,steamUrl,salesUrl,description). */
export async function importProductsCsv(
  slug: string,
  csv: string,
): Promise<ActionResult<{ created: number; skipped: number; errors: string[] }>> {
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const store = guard.state.store;
  const records = csvRecords(csv).slice(0, 300);
  if (records.length === 0) return { ok: false, message: "CSV boş görünüyor." };

  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    const title = (record.title ?? "").slice(0, 120).trim();
    if (!title) {
      skipped += 1;
      errors.push(`Satır ${index + 2}: başlık boş`);
      continue;
    }
    const currency = (record.currency ?? "TRY").toUpperCase().slice(0, 3) || "TRY";
    const ourPrice = parsePrice(record.ourprice || record.price || "0") ?? "0.00";
    let originalPrice = parsePrice(record.originalprice ?? "") ?? null;
    if (originalPrice !== null) {
      const converted = await convertAmount(originalPrice, currency, currency);
      originalPrice = converted ?? originalPrice;
    }
    const steamUrl = (record.steamurl ?? "").trim();
    if (steamUrl && !/^https?:\/\//i.test(steamUrl)) {
      skipped += 1;
      errors.push(`Satır ${index + 2}: Steam linki http(s) ile başlamalı`);
      continue;
    }
    await db.insert(games).values({
      storeId: store.id,
      title,
      description: (record.description ?? "").slice(0, 2000),
      salesUrl: (record.salesurl ?? "").slice(0, 500),
      steamUrl,
      steamAppId: steamUrl ? parseSteamAppId(steamUrl) : null,
      originalPrice,
      originalCurrency: currency,
      ourPrice,
      currency,
      coverImage: "",
      autoSync: false,
    });
    created += 1;
  }

  refreshStore(slug);
  await logAudit({
    action: "store.product.import",
    entity: "game",
    summary: `CSV içe aktarma: ${created} ürün eklendi, ${skipped} satır atlandı`,
    storeId: store.id,
    storeSlug: slug,
    metadata: { created, skipped, errors: errors.slice(0, 20) },
  });

  return {
    ok: created > 0,
    message:
      created > 0
        ? `${created} ürün içe aktarıldı${skipped ? `, ${skipped} satır atlandı` : ""}.`
        : "Hiçbir satır aktarılamadı.",
    data: { created, skipped, errors: errors.slice(0, 20) },
  };
}

/** Bulk account import from CSV. Secrets are encrypted exactly like the modal. */
export async function importAccountsCsv(
  slug: string,
  csv: string,
): Promise<ActionResult<{ created: number; skipped: number; errors: string[] }>> {
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: "Yetkiniz yok." };
  const store = guard.state.store;
  const records = csvRecords(csv).slice(0, 300);
  if (records.length === 0) return { ok: false, message: "CSV boş görünüyor." };

  const quota = await accountQuota(store);
  let remaining = quota.reached ? 0 : quota.max === null ? records.length : quota.max - quota.used;

  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    if (remaining <= 0) {
      skipped += 1;
      errors.push(`Satır ${index + 2}: hesap limiti dolu`);
      continue;
    }
    const productLabel = (record.productlabel ?? record.product ?? "").slice(0, 120).trim();
    const password = record.password ?? "";
    if (!productLabel || !password) {
      skipped += 1;
      errors.push(`Satır ${index + 2}: ürün adı ve şifre zorunlu`);
      continue;
    }
    const platform = (record.platform ?? "steam").toLowerCase().slice(0, 30) || "steam";
    const guardType = (record.guardtype ?? "none").toLowerCase();
    await db.insert(accounts).values({
      storeId: store.id,
      platform,
      platformLabel: (record.platformlabel ?? platform).slice(0, 40) || platform,
      username: (record.username ?? "").slice(0, 120) || null,
      email: (record.email ?? "").slice(0, 160) || null,
      password: encryptData(password),
      productLabel,
      linkedGameIds: [],
      guardType,
      steamSecret: guardHasSteam(guardType) && record.steamsecret ? encryptData(record.steamsecret) : null,
      totpSecret: guardHasTotp(guardType) && record.totpsecret ? encryptData(record.totpsecret.toUpperCase()) : null,
      mailEmail: (record.mailemail ?? "").slice(0, 160) || null,
      mailPassword: record.mailpassword ? encryptData(record.mailpassword) : null,
      mailProvider: "gmail",
      mailSenderFilter: "",
      notes: (record.notes ?? "").slice(0, 2000),
      status: "available",
    });
    created += 1;
    remaining -= 1;
  }

  refreshStore(slug);
  await logAudit({
    action: "store.account.import",
    entity: "account",
    summary: `CSV içe aktarma: ${created} hesap eklendi, ${skipped} satır atlandı`,
    storeId: store.id,
    storeSlug: slug,
    metadata: { created, skipped, errors: errors.slice(0, 20) },
  });

  return {
    ok: created > 0,
    message:
      created > 0
        ? `${created} hesap içe aktarıldı${skipped ? `, ${skipped} satır atlandı` : ""}.`
        : "Hiçbir satır aktarılamadı.",
    data: { created, skipped, errors: errors.slice(0, 20) },
  };
}
