"use server";

import { getTranslator } from "@/lib/i18n/server";

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
  const { t } = await getTranslator();
  const appId = parseSteamAppId(url);
  if (!appId) {
    return {
      ok: false,
      message: t("x.steam-linkinden-appid-okunamad-ornek-store-steampowered"),
    };
  }
  const details = await fetchSteamAppDetails(appId);
  if (!details) {
    return {
      ok: false,
      message:
        t("x.steam-store-api-yant-vermedi-baslk-kapak-ve-fiyat-manuel"),
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
        ? t("x.steam-bilgileri-alnd")
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
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
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

  if (!title) return { ok: false, message: t("x.urun-baslg-zorunludur-veya-steam-linki-girin") };
  if (salesUrl && !/^https?:\/\//i.test(salesUrl)) {
    return { ok: false, message: t("x.sats-ilan-linki-http-s-ile-baslamaldr") };
  }
  if (steamUrl && !/^https?:\/\//i.test(steamUrl)) {
    return { ok: false, message: t("x.steam-linki-http-s-ile-baslamaldr") };
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
    if (updated.length === 0) return { ok: false, message: t("x.urun-bulunamad") };
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
    return { ok: true, message: t("x.urun-guncellendi-2"), data: { id } };
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
  return { ok: true, message: t("x.urun-eklendi-2"), data: { id: created.id } };
}

export async function deleteGame(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = intOrNull(str(formData, "id"));
  if (!id) return { ok: false, message: t("x.urun-bulunamad") };

  const storeCodes = await db
    .select({ id: codes.id, gameIds: codes.gameIds })
    .from(codes)
    .where(eq(codes.storeId, guard.state.store.id));
  const codeRows = storeCodes.filter((row) => (row.gameIds ?? []).includes(id));
  if (codeRows.length > 0) {
    return {
      ok: false,
      message: t("x.bu-urune-bagl-kodlar-var-once-ilgili-kodlar-silin-veya-u"),
    };
  }

  await db.delete(games).where(and(eq(games.id, id), eq(games.storeId, guard.state.store.id)));
  refreshStore(slug);
  await logAudit({
    action: "store.product.delete",
    entity: "game",
    entityId: id,
    summary: t("x.urun-silindi"),
    severity: "warn",
    storeId: guard.state.store.id,
    storeSlug: slug,
  });
  return { ok: true, message: t("x.urun-silindi-2") };
}

export async function syncSteamNow(formData: FormData): Promise<ActionResult<{ updated: number }>> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
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
    return { ok: false, message: t("x.senkronizasyon-ack-ve-steam-linki-olan-urun-bulunamad") };
  }
  return {
    ok: true,
    message: result.failed
        ? t("x.updated-checked-urun-guncellendi-failed-hata", { updated: result.updated, checked: result.checked, failed: result.failed })
        : t("x.updated-checked-urun-guncellendi", { updated: result.updated, checked: result.checked }),
    data: { updated: result.updated },
  };
}

/* ------------------------------ Accounts ----------------------------- */

export async function saveAccount(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const { store } = guard.state;

  const id = intOrNull(str(formData, "id"));
  const platform = str(formData, "platform").toLowerCase() || "steam";
  const preset = PLATFORM_PRESETS.find((item) => item.id === platform);
  if (!preset) return { ok: false, message: t("x.gecersiz-platform") };

  const customLabel = str(formData, "platformLabel");
  const platformLabel = platform === "custom" ? customLabel : preset.label;
  if (!platformLabel) return { ok: false, message: t("x.ozel-platform-ad-zorunludur") };

  const username = str(formData, "username");
  const email = str(formData, "email");
  const password = str(formData, "password");
  const productLabel = str(formData, "productLabel");
  const guardType = str(formData, "guardType") || "none";
  if (!GUARD_OPTIONS.some((option) => option.id === guardType)) {
    return { ok: false, message: t("x.gecersiz-koruma-turu-secildi") };
  }

  let existingAccount: typeof accounts.$inferSelect | null = null;
  if (id) {
    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.storeId, store.id)))
      .limit(1);
    existingAccount = rows[0] ?? null;
    if (!existingAccount) return { ok: false, message: t("x.hesap-bulunamad") };
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

  if (!password) return { ok: false, message: t("x.sifre-zorunludur") };
  if (!username && !email) {
    return { ok: false, message: t("x.kullanc-ad-veya-e-posta-adresinden-en-az-biri-zorunludur") };
  }
  if (preset.kind === "steam" && !username) {
    return { ok: false, message: t("x.steam-hesab-icin-kullanc-ad-zorunludur") };
  }

  if (guardHasSteam(guardType)) {
    if (!steamSecret) return { ok: false, message: t("x.steam-guard-secildigi-icin-shared-secret-zorunludur") };
    if (!isValidSteamSecret(steamSecret)) {
      return {
        ok: false,
        message:
          t("x.steam-guard-shared-secret-gecersiz-steam-desktop-authent"),
      };
    }
  }
  if (guardHasTotp(guardType)) {
    if (!totpSecret) return { ok: false, message: t("x.2fa-totp-secildigi-icin-secret-key-zorunludur") };
    if (!isValidTotpSecret(totpSecret)) {
      return { ok: false, message: t("x.2fa-secret-key-gecersiz-base32-formatnda-olmaldr") };
    }
  }
  if (guardHasEmail(guardType)) {
    if (!mailEmail) return { ok: false, message: t("x.e-posta-dogrulamas-icin-mail-adresi-zorunludur") };
    if (!mailPassword) {
      return {
        ok: false,
        message: t("x.e-posta-dogrulamas-icin-uygulama-sifresi-imap-zorunludur"),
      };
    }
    if (!MAIL_PRESETS.some((mail) => mail.id === mailProvider)) {
      return { ok: false, message: t("x.gecersiz-mail-saglaycs-secildi") };
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
    if (updated.length === 0) return { ok: false, message: t("x.hesap-bulunamad") };
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
    return { ok: true, message: t("x.hesap-guncellendi-2"), data: { id } };
  }

  const quota = await accountQuota(store);
  if (quota.reached) {
    return {
      ok: false,
      message: t("x.hesap-limitiniz-dolu-used-max-bayilik-paketinizi-yukselt", { used: quota.used ?? 0, max: quota.max ?? 0 }),
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
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const gate = hitRateLimit(`code-test:${guard.state.store.id}`, 20, 60_000);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-test-istegi-seconds-saniye-bekleyin", { seconds: gate.retryInSeconds }) };
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
      return { ok: false, message: t("x.steam-guard-kodu-uretilemedi-shared-secret-gecersiz-veya") };
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
      return { ok: false, message: t("x.totp-kodu-uretilemedi-secret-key-gecersiz-veya-bos") };
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
    if (!mail.ok) return { ok: false, message: t("x.mail-kodu-alnamad-detail", { detail: mail.message }) };
    results.push({
      label: `E-posta (${mail.from || email})`,
      code: mail.code,
      kind: "email",
      secondsRemaining: 0,
    });
  }

  if (results.length === 0) {
    return { ok: false, message: t("x.test-edilecek-bir-koruma-yontemi-secilmedi") };
  }
  return { ok: true, message: t("x.kod-lar-basaryla-uretildi"), data: { results } };
}

export async function deleteAccount(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = intOrNull(str(formData, "id"));
  if (!id) return { ok: false, message: t("x.hesap-bulunamad") };

  const entitlementRows = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.storeId, guard.state.store.id), eq(entitlements.accountId, id)));
  const active = entitlementRows.filter((row) => !row.expiresAt || new Date(row.expiresAt).getTime() > Date.now());
  if (active.length > 0) {
    return { ok: false, message: t("x.bu-hesap-aktif-bir-teslimatta-kullanlyor-silinemez") };
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
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = intOrNull(str(formData, "id"));
  const status = str(formData, "status");
  if (!id || !["available", "retired"].includes(status)) {
    return { ok: false, message: t("x.gecersiz-istek") };
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
    summary: status === "retired" ? t("x.hesap-pasife-alnd") : t("x.hesap-aktiflestirildi"),
    storeId: guard.state.store.id,
    storeSlug: slug,
    metadata: { status },
  });
  return { ok: true, message: status === "retired" ? t("x.hesap-pasife-alnd-2") : t("x.hesap-aktiflestirildi-2") };
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
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(payload.slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const { store } = guard.state;

  if (!["choice", "single", "bundle"].includes(payload.type)) {
    return { ok: false, message: t("x.gecersiz-kod-turu") };
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
      return { ok: false, message: t("x.secmeli-kod-icin-once-magazaya-oyun-eklemelisiniz") };
    }
  } else {
    if (gameIds.length + accountIds.length === 0) {
      return { ok: false, message: t("x.en-az-bir-urun-oyun-veya-hesap-secmelisiniz") };
    }
    if (payload.type === "single" && gameIds.length + accountIds.length !== 1) {
      return { ok: false, message: t("x.tekli-modda-yalnzca-1-hedef-secilebilir") };
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
      return { ok: false, message: t("x.secilen-hedefler-bu-magazada-bulunamad") };
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
    return { ok: false, message: t("x.kod-uretilemedi-lutfen-tekrar-deneyin") };
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
    message: t("x.count-kod-uretildi", { count: inserted.length }),
    data: { codes: inserted.map((row) => row.code) },
  };
}

export async function deleteCode(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const id = intOrNull(str(formData, "id"));
  if (!id) return { ok: false, message: t("x.kod-bulunamad") };
  const rows = await db
    .select({ redeemedAt: codes.redeemedAt })
    .from(codes)
    .where(and(eq(codes.id, id), eq(codes.storeId, guard.state.store.id)))
    .limit(1);
  if (rows.length === 0) return { ok: false, message: t("x.kod-bulunamad") };
  if (rows[0].redeemedAt) {
    return { ok: false, message: t("x.kullanlms-kodlar-silinemez-arsiv-olarak-saklanr") };
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
  const { t } = await getTranslator();
  const currentSlug = str(formData, "slug");
  const guard = await requireStoreAdmin(currentSlug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const { store } = guard.state;

  const nextSlug = slugify(str(formData, "newSlug") || currentSlug);
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(nextSlug)) {
    return { ok: false, message: t("x.magaza-id-3-30-karakter-olmaldr") };
  }
  if (RESERVED_SLUGS.has(nextSlug)) {
    return { ok: false, message: t("x.bu-magaza-id-ayrlms-durumda") };
  }
  if (nextSlug !== store.slug) {
    const taken = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, nextSlug)).limit(1);
    if (taken.length > 0) return { ok: false, message: t("x.bu-magaza-id-zaten-kullanlyor") };
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
    return { ok: false, message: t("x.logo-adresi-http-s-ile-baslamaldr") };
  }
  if (faviconUrl && !/^https?:\/\//i.test(faviconUrl)) {
    return { ok: false, message: t("x.favicon-adresi-http-s-ile-baslamaldr") };
  }
  if (!FONT_OPTIONS.some((option) => option.family === fontFamily)) {
    return { ok: false, message: t("x.desteklenmeyen-font-secimi") };
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
        : t("x.magaza-ayarlar-guncellendi"),
    storeId: store.id,
    storeSlug: nextSlug,
    metadata: { nextSlug, title, fontFamily, contactLinks, logoUrl, primaryColor, accentColor },
  });
  return {
    ok: true,
    message: nextSlug !== store.slug ? t("x.ayarlar-kaydedildi-magaza-id-guncellendi") : "Ayarlar kaydedildi.",
    data: { slug: nextSlug },
  };
}

/* ------------------------------- Domain ------------------------------ */

export async function saveStoreDomain(
  formData: FormData,
): Promise<ActionResult<{ domain: string; token: string }>> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
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
      summary: `${store.customDomain ?? t("x.ozel-alan-ad")} kaldırıldı`,
      severity: "warn",
      storeId: store.id,
      storeSlug: store.slug,
    });
    return { ok: true, message: t("x.ozel-alan-ad-kaldrld-2"), data: { domain: "", token: "" } };
  }

  const domain = normalizeDomain(raw);
  if (!isValidDomain(domain)) {
    return {
      ok: false,
      message: t("x.gecerli-bir-alan-ad-girin-ornek-magazadi-com-protokol-po"),
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
    return { ok: false, message: t("x.bu-alan-ad-baska-bir-magaza-tarafndan-dogrulanms") };
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
    return { ok: false, message: t("x.bu-alan-ad-baska-bir-magazaya-bagl") };
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
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };

  const gate = hitRateLimit(`domain-verify:${guard.state.store.id}`, 10, 60_000);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-dogrulama-denemesi-seconds-saniye-sonra-tekrar", { seconds: gate.retryInSeconds }) };
  }

  const rows = await db.select().from(stores).where(eq(stores.id, guard.state.store.id)).limit(1);
  const store = rows[0];
  if (!store?.customDomain) {
    return { ok: false, message: t("x.once-bir-alan-ad-kaydedin") };
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
      message: t("x.bu-alan-ad-baska-bir-magaza-tarafndan-dogrulanms-lutfen"),
    };
  }

  let records: string[][];
  try {
    records = await Promise.race([
      dns.resolveTxt(recordName),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          const error = new Error(t("x.dns-zaman-asm"));
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
        message: t("x.record-icin-txt-kayd-bulunamad-dns-yaylm-birkac-dakika-s", { record: recordName }),
      };
    }
    return {
      ok: false,
      message: t("x.dns-sorgusu-tamamlanamad-alan-adnn-yaynda-oldugundan-ve"),
    };
  }

  const values = records.map((chunks) => chunks.join("").trim());
  if (!values.includes(expected)) {
    return {
      ok: false,
      message: t("x.record-txt-kayd-bulundu-ancak-deger-eslesmiyor-beklenen-", { record: recordName, expected }),
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
      message: t("x.bu-alan-ad-baska-bir-magaza-tarafndan-dogrulanms-lutfen"),
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
    message: t("x.domain-dogruland-alan-ad-birkac-saniye-icinde-magazanza-", { domain }),
  };
}

export async function saveStoreCredentials(formData: FormData): Promise<ActionResult> {
  const { t } = await getTranslator();
  const slug = str(formData, "slug");
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const username = str(formData, "username");
  const email = str(formData, "email");
  const currentPassword = str(formData, "currentPassword");
  const newPassword = str(formData, "newPassword");

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, message: t("x.yonetici-kullanc-ad-3-32-karakter-olmaldr") };
  }
  const reserved = await managerIdentifierError(username, email);
  if (reserved) return { ok: false, message: reserved };
  const duplicate = await db
    .select({ id: storeAdmins.id })
    .from(storeAdmins)
    .where(and(sql`lower(${storeAdmins.username}) = ${username.toLowerCase()}`, ne(storeAdmins.id, guard.session.adminId)))
    .limit(1);
  if (duplicate.length > 0) {
    return { ok: false, message: t("x.bu-yonetici-kullanc-ad-platformda-zaten-kullanlyor") };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: t("x.gecerli-bir-e-posta-girin") };
  }
  const rows = await db
    .select()
    .from(storeAdmins)
    .where(and(eq(storeAdmins.id, guard.session.adminId), eq(storeAdmins.storeId, guard.state.store.id)))
    .limit(1);
  const admin = rows[0];
  if (!admin) return { ok: false, message: t("x.yonetici-bulunamad") };

  let passwordHash = admin.passwordHash;
  if (newPassword) {
    if (!verifyPassword(currentPassword, admin.passwordHash)) {
      return { ok: false, message: t("x.mevcut-sifre-hatal") };
    }
    if (newPassword.length < 6) return { ok: false, message: t("x.yeni-sifre-en-az-6-karakter-olmaldr") };
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
        ? t("x.yonetici-kullanc-ad-e-postas-ve-sifresi-guncellendi")
        : t("x.yonetici-kullanc-ad-ve-e-postas-guncellendi"),
    severity: newPassword ? "warn" : "info",
    storeId: guard.state.store.id,
    storeSlug: slug,
    metadata: { username, email, passwordChanged: newPassword.length > 0 },
  });

  return { ok: true, message: t("x.yonetici-bilgileri-guncellendi") };
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
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const store = guard.state.store;
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (unique.length === 0) return { ok: false, message: t("x.secim-yaplmad") };

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
    message: skipped
      ? t("x.count-kod-silindi-kept-kullanlms-kod-korundu", { count: deletable.length, kept: skipped })
      : t("x.count-kod-silindi", { count: deletable.length }),
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
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const store = guard.state.store;
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (unique.length === 0) return { ok: false, message: t("x.urun-secilmedi") };
  if (!Number.isFinite(value) || value === 0) return { ok: false, message: t("x.gecerli-bir-deger-girin") };
  if (mode === "percent" && (value <= -100 || value > 500)) {
    return { ok: false, message: t("x.yuzde-degeri-99-ile-500-arasnda-olmaldr") };
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

  return { ok: true, message: t("x.count-urun-fiyat-guncellendi", { count: updated }), data: { updated } };
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
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const store = guard.state.store;
  const records = csvRecords(csv).slice(0, 300);
  if (records.length === 0) return { ok: false, message: t("x.csv-bos-gorunuyor") };

  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    const title = (record.title ?? "").slice(0, 120).trim();
    if (!title) {
      skipped += 1;
      errors.push(t("x.satr-row-baslk-bos", { row: index + 2 }));
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
      errors.push(t("x.satr-row-steam-linki-http-s-ile-baslamal", { row: index + 2 }));
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
        : t("x.hicbir-satr-aktarlamad"),
    data: { created, skipped, errors: errors.slice(0, 20) },
  };
}

/** Bulk account import from CSV. Secrets are encrypted exactly like the modal. */
export async function importAccountsCsv(
  slug: string,
  csv: string,
): Promise<ActionResult<{ created: number; skipped: number; errors: string[] }>> {
  const { t } = await getTranslator();
  const guard = await requireStoreAdmin(slug);
  if (!guard) return { ok: false, message: t("x.yetkiniz-yok") };
  const store = guard.state.store;
  const records = csvRecords(csv).slice(0, 300);
  if (records.length === 0) return { ok: false, message: t("x.csv-bos-gorunuyor") };

  const quota = await accountQuota(store);
  let remaining = quota.reached ? 0 : quota.max === null ? records.length : quota.max - quota.used;

  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    if (remaining <= 0) {
      skipped += 1;
      errors.push(t("x.satr-row-hesap-limiti-dolu", { row: index + 2 }));
      continue;
    }
    const productLabel = (record.productlabel ?? record.product ?? "").slice(0, 120).trim();
    const password = record.password ?? "";
    if (!productLabel || !password) {
      skipped += 1;
      errors.push(t("x.satr-row-urun-ad-ve-sifre-zorunlu", { row: index + 2 }));
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
        : t("x.hicbir-satr-aktarlamad"),
    data: { created, skipped, errors: errors.slice(0, 20) },
  };
}
