"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureDatabase } from "@/db";
import {
  accounts,
  codes,
  customers,
  entitlements,
  games,
  redemptions,
  type Account,
} from "@/db/schema";
import { hashPassword, randomToken, verifyPassword } from "@/lib/crypto";
import { decryptData } from "@/lib/secret-crypto";
import {
  accessExpired,
  formatDuration,
  remainingLabel,
} from "@/lib/format";
import {
  CUSTOMER_COOKIE,
  getCustomerSession,
  setSessionCookie,
} from "@/lib/session";
import { requireCustomer, resolveStoreState } from "@/lib/tenant";
import { findStoreBySlug } from "@/lib/tenant";
import { generateSteamGuardCode, generateTotpCode, secondsRemaining } from "@/lib/totp";
import { guardHasEmail, guardHasSteam, guardHasTotp } from "@/lib/fonts";
import { sendDeliveryReceipt } from "@/lib/mail-events";
import { logAudit } from "@/lib/audit";
import { fetchLatestMailCode } from "@/lib/imap";
import type {
  ActionResult,
  CodePreview,
  DeliveredItem,
  RedeemResult,
} from "@/lib/types";

export type RedeemPayload = {
  slug: string;
  code: string;
  choiceGameIds?: number[];
  auth?:
    | { mode: "register"; username: string; password: string; displayName?: string }
    | { mode: "login"; username: string; password: string };
};

class RedeemError extends Error {}

async function activeStore(slug: string) {
  await ensureDatabase();
  const store = await findStoreBySlug(slug);
  if (!store) return { error: "Mağaza bulunamadı." as const, store: null };
  const state = resolveStoreState(store);
  if (!state.active) {
    return {
      error: state.suspended
        ? "Mağaza geçici olarak askıya alındı."
        : "Mağazanın bayilik süresi doldu, teslimat yapılamıyor.",
      store: null,
    };
  }
  return { error: null, store };
}

async function loadCode(storeId: number, rawCode: string) {
  const normalized = rawCode.trim().toUpperCase();
  if (!normalized) return { error: "Kod girin.", code: null };
  const rows = await db
    .select()
    .from(codes)
    .where(and(eq(codes.storeId, storeId), eq(codes.code, normalized)))
    .limit(1);
  const row = rows[0];
  if (!row) return { error: "Kod bulunamadı. Lütfen kodu kontrol edin.", code: null };
  if (row.redeemedAt) {
    return { error: "Bu kod daha önce kullanılmış. Her kod yalnızca bir kez geçerlidir.", code: null };
  }
  return { error: null, code: row };
}

export async function previewCode(slug: string, rawCode: string): Promise<ActionResult<CodePreview>> {
  const { error, store } = await activeStore(slug);
  if (!store) return { ok: false, message: error ?? "Mağaza bulunamadı." };

  const loaded = await loadCode(store.id, rawCode);
  if (!loaded.code) return { ok: false, message: loaded.error ?? "Kod geçersiz." };
  const code = loaded.code;

  const storeGames = await db.select().from(games).where(eq(games.storeId, store.id));

  const items: CodePreview["items"] = [];
  if (code.type !== "choice") {
    const gameRows = code.gameIds.length
      ? storeGames.filter((game) => code.gameIds.includes(game.id))
      : [];
    for (const game of gameRows) {
      items.push({
        kind: "game",
        id: game.id,
        title: game.title,
        subtitle: "Oyun erişimi + atanmış hesap",
        coverImage: game.coverImage,
      });
    }
    if (code.accountIds.length) {
      const accountRows = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.storeId, store.id), inArray(accounts.id, code.accountIds)));
      for (const account of accountRows) {
        items.push({
          kind: "account",
          id: account.id,
          title:
            storeGames.find((game) => account.linkedGameIds.includes(game.id))?.title ??
            account.productLabel ??
            account.platformLabel,
          subtitle: `${account.platformLabel} hesabı`,
          coverImage:
            storeGames.find((game) => account.linkedGameIds.includes(game.id))?.coverImage ?? "",
        });
      }
    }
  }

  const session = await getCustomerSession();
  const requiresAuth = !session || session.storeId !== store.id;

  return {
    ok: true,
    data: {
      code: code.code,
      type: code.type as CodePreview["type"],
      choiceCount: code.choiceCount,
      durationMinutes: code.durationMinutes,
      // Shared accounts are never time-limited: the customer keeps unlimited access.
      durationLabel: "Sınırsız erişim",
      items,
      selectableGames: storeGames.map((game) => ({
        id: game.id,
        title: game.title,
        coverImage: game.coverImage,
        ourPrice: game.ourPrice,
        originalPrice: game.originalPrice,
      })),
      requiresAuth,
    },
  };
}

export async function redeemCode(payload: RedeemPayload): Promise<ActionResult<RedeemResult>> {
  const { error, store } = await activeStore(payload.slug);
  if (!store) return { ok: false, message: error ?? "Mağaza bulunamadı." };

  const loaded = await loadCode(store.id, payload.code);
  if (!loaded.code) return { ok: false, message: loaded.error ?? "Kod geçersiz." };
  const code = loaded.code;

  const tenantId = store.id;
  const tenantSlug = store.slug;

  /* ----------------------- resolve customer ------------------------ */
  let customerId: number | null = null;
  let customerUsername: string | null = null;
  const session = await getCustomerSession();
  if (session && session.storeId === store.id) {
    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, session.customerId), eq(customers.storeId, store.id)))
      .limit(1);
    if (rows[0]) {
      customerId = rows[0].id;
      customerUsername = rows[0].username;
    }
  }

  if (!customerId && payload.auth && payload.auth.username.trim()) {
    const username = payload.auth.username.trim();
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
      return { ok: false, message: "Kullanıcı adı 3-24 karakter olmalıdır." };
    }
    if (payload.auth.password.length < 6) {
      return { ok: false, message: "Şifre en az 6 karakter olmalıdır." };
    }
    const existingRows = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.storeId, store.id), sql`lower(${customers.username}) = ${username.toLowerCase()}`),
      )
      .limit(1);
    const existing = existingRows[0];

    if (payload.auth.mode === "login") {
      if (!existing || !verifyPassword(payload.auth.password, existing.passwordHash)) {
        return { ok: false, message: "Kullanıcı adı veya şifre hatalı." };
      }
      customerId = existing.id;
      customerUsername = existing.username;
    } else {
      if (existing) {
        return {
          ok: false,
          message: "Bu kullanıcı adı alınmış. Giriş yapmayı deneyin veya farklı bir ad seçin.",
        };
      }
      const [created] = await db
        .insert(customers)
        .values({
          storeId: store.id,
          username,
          displayName: payload.auth.displayName?.trim() || username,
          passwordHash: hashPassword(payload.auth.password),
        })
        .returning();
      customerId = created.id;
      customerUsername = created.username;
    }
    await setSessionCookie(CUSTOMER_COOKIE, {
      kind: "customer",
      storeId: store.id,
      customerId,
      username: customerUsername,
    });
  }

  /* ------------------------- resolve targets ----------------------- */
  const storeGames = await db.select().from(games).where(eq(games.storeId, store.id));
  const gameById = new Map(storeGames.map((game) => [game.id, game]));

  let targetGameIds: number[] = [];
  let targetAccountIds: number[] = [];

  if (code.type === "choice") {
    const chosen = Array.from(new Set(payload.choiceGameIds ?? [])).filter((id) =>
      gameById.has(id),
    );
    if (chosen.length !== code.choiceCount) {
      return {
        ok: false,
        message: `Bu kod için tam olarak ${code.choiceCount} oyun seçmelisiniz.`,
      };
    }
    targetGameIds = chosen;
  } else {
    targetGameIds = code.gameIds.filter((id) => gameById.has(id));
    targetAccountIds = code.accountIds;
  }

  if (targetGameIds.length + targetAccountIds.length === 0) {
    return {
      ok: false,
      message: "Bu kodun hedef ürünleri mağazada bulunamadı. Lütfen mağaza yönetimiyle iletişime geçin.",
    };
  }

  // The platform delivers shared accounts, so access never expires: a code is a
  // permanent, unlimited assignment even if the code form offered a duration.
  const accessExpiresAt: Date | null = null;
  const guestToken = randomToken(18);

  let delivered: DeliveredItem[] = [];

  try {
    delivered = await db.transaction(async (tx) => {
      const claim = await tx
        .update(codes)
        .set({
          redeemedAt: new Date(),
          redeemedByCustomerId: customerId,
        })
        .where(and(eq(codes.id, code.id), sql`${codes.redeemedAt} is null`))
        .returning({ id: codes.id });
      if (claim.length === 0) {
        throw new RedeemError("Kod birkaç saniye önce kullanıldı. Lütfen yeni bir kod deneyin.");
      }

      const [redemption] = await tx
        .insert(redemptions)
        .values({
          storeId: tenantId,
          codeId: code.id,
          customerId,
          guestUsername: customerId ? null : "Misafir kullanıcı",
          guestToken,
          accessExpiresAt,
        })
        .returning();

      const outputs: DeliveredItem[] = [];

      /**
       * Shared inventory: the same account is reused for every delivery instead
       * of being "sold" once. Accounts are only excluded when the store owner
       * retires them manually.
       */
      async function claimAccountForGame(gameId: number): Promise<Account | null> {
        const pool = await tx
          .select()
          .from(accounts)
          .where(and(eq(accounts.storeId, tenantId), sql`${accounts.status} <> 'retired'`));
        const linked = pool.filter((account) => (account.linkedGameIds ?? []).includes(gameId));
        const steamLinked = linked.filter((account) => account.platform === "steam");
        return steamLinked[0] ?? linked[0] ?? null;
      }

      async function deliverGame(gameId: number) {
        const game = gameById.get(gameId);
        if (!game) return;
        const account = await claimAccountForGame(gameId);
        const [entitlement] = await tx
          .insert(entitlements)
          .values({
            storeId: tenantId,
            redemptionId: redemption.id,
            codeId: code.id,
            customerId,
            kind: "game",
            gameId,
            accountId: account?.id ?? null,
            title: game.title,
            expiresAt: accessExpiresAt,
          })
          .returning();
        outputs.push({
          entitlementId: entitlement.id,
          title: game.title,
          subtitle: game.steamUrl ? "Steam oyun erişimi" : "Dijital ürün",
          kind: "game",
          username: account?.username ?? null,
          email: account?.email ?? null,
          password: account ? decryptData(account.password) : null,
          platformLabel: account?.platformLabel ?? "Steam",
          guardType: account?.guardType ?? "none",
          mailEmail: account?.mailEmail ?? null,
          mailPassword: account ? decryptData(account.mailPassword) : null,
          notes: account?.notes ?? "",
          expiresAt: null,
          coverImage: game.coverImage,
          accessToken: customerId ? undefined : guestToken,
        });
      }

      async function deliverAccount(accountId: number) {
        const rows = await tx
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.storeId, tenantId)))
          .limit(1);
        const account = rows[0];
        if (!account) throw new RedeemError("Koda bağlı hesap bulunamadı.");
        if (account.status === "retired") {
          throw new RedeemError(`${account.platformLabel} hesabı mağaza yönetimi tarafından kapatılmış.`);
        }
        // Shared account: no state change, the customer gets unlimited access.
        const linkedGame = storeGames.find((game) => account.linkedGameIds.includes(game.id));
        const title = linkedGame?.title ?? account.productLabel ?? account.platformLabel;
        const [entitlement] = await tx
          .insert(entitlements)
          .values({
            storeId: tenantId,
            redemptionId: redemption.id,
            codeId: code.id,
            customerId,
            kind: "account",
            gameId: linkedGame?.id ?? null,
            accountId: account.id,
            title,
            expiresAt: accessExpiresAt,
          })
          .returning();
        outputs.push({
          entitlementId: entitlement.id,
          title,
          subtitle: `${account.platformLabel} hesabı`,
          kind: "account",
          username: account.username,
          email: account.email,
          password: decryptData(account.password),
          platformLabel: account.platformLabel,
          guardType: account.guardType,
          mailEmail: account.mailEmail,
          mailPassword: decryptData(account.mailPassword),
          notes: account.notes,
          expiresAt: null,
          coverImage: linkedGame?.coverImage ?? "",
          accessToken: customerId ? undefined : guestToken,
        });
      }

      for (const gameId of targetGameIds) {
        await deliverGame(gameId);
      }
      for (const accountId of targetAccountIds) {
        await deliverAccount(accountId);
      }

      if (outputs.length === 0) {
        throw new RedeemError("Kod için teslim edilecek ürün bulunamadı.");
      }
      return outputs;
    });
  } catch (err) {
    if (err instanceof RedeemError) return { ok: false, message: err.message };
    console.error("[redeem] failed", err);
    return { ok: false, message: "Kod kullanılamadı. Lütfen tekrar deneyin." };
  }

  await logAudit({
    action: "code.redeem",
    entity: "code",
    entityId: code.id,
    summary: `${code.code} kodu kullanıldı, ${delivered.length} ürün teslim edildi`,
    storeId: tenantId,
    storeSlug: store.slug,
    actorType: customerId ? "customer" : "system",
    actorId: customerId ?? null,
    actorName: customerId ? `müşteri#${customerId}` : "misafir",
    metadata: {
      items: delivered.map((item) => item.title),
      guest: !customerId,
    },
  });

  // Delivery receipt for members (guests have no mailbox on file). Failures are
  // swallowed by `deliver`, so the redemption result never depends on SMTP.
  await sendDeliveryReceipt({
    store,
    customerId,
    code: code.code,
    items: delivered.map((item) => ({ title: item.title, platformLabel: item.platformLabel })),
  }).catch((err) => console.error("[redeem] receipt mail failed", err));

  revalidatePath(`/${store.slug}`, "layout");
  return {
    ok: true,
    message: customerId
      ? "Kod kullanıldı. Ürünler kütüphanenize eklendi."
      : "Kod kullanıldı. Bilgileri hemen kaydedin!",
    data: {
      code: code.code,
      expiresAt: null,
      guest: !customerId,
      guestToken: customerId ? null : guestToken,
      items: delivered,
    },
  };
}

export type AccessCode = {
  code: string;
  digits: number;
  kind: "steam" | "totp" | "email";
  secondsRemaining: number;
  expiresAt: string | null;
  detail?: string;
};

/**
 * Returns the live access code for a delivered item.
 *
 * Works for logged-in customers and for guests that just redeemed a code: the
 * redemption issues an unguessable token that is embedded in the delivery result.
 */
export async function getTwoFactorCode(
  slug: string,
  entitlementId: number,
  guestToken?: string | null,
): Promise<ActionResult<AccessCode>> {
  await ensureDatabase();
  const store = await findStoreBySlug(slug);
  if (!store) return { ok: false, message: "Mağaza bulunamadı." };
  const state = resolveStoreState(store);
  if (!state.active) return { ok: false, message: "Mağazanın erişimi aktif değil." };

  const session = await getCustomerSession();
  const customerSession = session && session.storeId === store.id ? session : null;

  const rows = await db
    .select({ entitlement: entitlements, account: accounts, redemption: redemptions })
    .from(entitlements)
    .leftJoin(accounts, eq(accounts.id, entitlements.accountId))
    .leftJoin(redemptions, eq(redemptions.id, entitlements.redemptionId))
    .where(and(eq(entitlements.id, entitlementId), eq(entitlements.storeId, store.id)))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, message: "Bu ürün bulunamadı." };

  const ownedByCustomer = Boolean(
    customerSession && row.entitlement.customerId === customerSession.customerId,
  );
  const ownedByGuest = Boolean(guestToken && row.redemption?.guestToken === guestToken);
  if (!ownedByCustomer && !ownedByGuest) {
    return { ok: false, message: "Kod almak için giriş yapmalısınız veya teslimat bağlantısını kullanmalısınız." };
  }

  const account = row.account;
  if (!account) return { ok: false, message: "Bu ürüne atanmış bir hesap yok." };

  const guardType = account.guardType || "none";
  const steamSecret = account.steamSecret ? decryptData(account.steamSecret) : "";
  const totpSecret = account.totpSecret ? decryptData(account.totpSecret) : "";

  if (guardHasSteam(guardType) && steamSecret) {
    return {
      ok: true,
      data: {
        code: generateSteamGuardCode(steamSecret),
        digits: 5,
        kind: "steam",
        secondsRemaining: secondsRemaining(),
        expiresAt: null,
      },
    };
  }
  if (guardHasTotp(guardType) && totpSecret) {
    return {
      ok: true,
      data: {
        code: generateTotpCode(totpSecret),
        digits: 6,
        kind: "totp",
        secondsRemaining: secondsRemaining(),
        expiresAt: null,
      },
    };
  }
  if (guardHasEmail(guardType) && account.mailEmail) {
    const mail = await fetchLatestMailCode({
      email: account.mailEmail,
      password: account.mailPassword ? decryptData(account.mailPassword) : "",
      host: account.mailHost,
      port: account.mailPort,
      secure: (account.mailPort ?? 993) === 993,
      senderFilter: account.mailSenderFilter || "steam",
      sinceMinutes: 180,
    });
    if (!mail.ok) return { ok: false, message: `Mail kodu alınamadı: ${mail.message}` };
    return {
      ok: true,
      data: {
        code: mail.code,
        digits: mail.code.length,
        kind: "email",
        secondsRemaining: 0,
        expiresAt: null,
        detail: mail.subject || mail.from,
      },
    };
  }
  return { ok: false, message: "Bu hesap için 2FA/Guard kodu tanımlı değil." };
}

/** Shared helper used by the library page for "kalan süre" labels. */
export async function describeRemaining(expiresAt: Date | string | null): Promise<string> {
  return remainingLabel(expiresAt);
}
