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
import { hashPassword, verifyPassword } from "@/lib/crypto";
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
      durationLabel: formatDuration(code.durationMinutes),
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

  const accessExpiresAt =
    code.durationMinutes === null ? null : new Date(Date.now() + code.durationMinutes * 60_000);

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
          accessExpiresAt,
        })
        .returning();

      const outputs: DeliveredItem[] = [];

      async function claimAccountForGame(gameId: number): Promise<Account | null> {
        const available = await tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.storeId, tenantId),
              eq(accounts.status, "available"),
              eq(accounts.platform, "steam"),
            ),
          );
        const candidates = available.filter((account) => (account.linkedGameIds ?? []).includes(gameId)).slice(0, 5);
        for (const candidate of candidates) {
          const updated = await tx
            .update(accounts)
            .set({ status: "assigned", updatedAt: new Date() })
            .where(and(eq(accounts.id, candidate.id), eq(accounts.status, "available")))
            .returning();
          if (updated[0]) return updated[0];
        }
        return null;
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
          expiresAt: accessExpiresAt ? accessExpiresAt.toISOString() : null,
          coverImage: game.coverImage,
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
        const updated = await tx
          .update(accounts)
          .set({ status: "assigned", updatedAt: new Date() })
          .where(and(eq(accounts.id, account.id), eq(accounts.status, "available")))
          .returning();
        if (!updated[0]) {
          throw new RedeemError(`${account.platformLabel} hesabı şu anda başka bir teslimatta kullanımda.`);
        }
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
          expiresAt: accessExpiresAt ? accessExpiresAt.toISOString() : null,
          coverImage: linkedGame?.coverImage ?? "",
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

  revalidatePath(`/${store.slug}`, "layout");
  return {
    ok: true,
    message: customerId
      ? "Kod kullanıldı. Ürünler kütüphanenize eklendi."
      : "Kod kullanıldı. Bilgileri hemen kaydedin!",
    data: {
      code: code.code,
      expiresAt: accessExpiresAt ? accessExpiresAt.toISOString() : null,
      guest: !customerId,
      items: delivered,
    },
  };
}

export async function getTwoFactorCode(
  slug: string,
  entitlementId: number,
): Promise<ActionResult<{ code: string; digits: number; kind: "steam" | "totp"; secondsRemaining: number; expiresAt: string | null }>> {
  const guard = await requireCustomer(slug);
  if (!guard) return { ok: false, message: "Kod almak için giriş yapmalısınız." };
  if (!guard.state.active) return { ok: false, message: "Mağaza erişimi aktif değil." };

  const rows = await db
    .select({ entitlement: entitlements, account: accounts })
    .from(entitlements)
    .leftJoin(accounts, eq(accounts.id, entitlements.accountId))
    .where(
      and(
        eq(entitlements.id, entitlementId),
        eq(entitlements.storeId, guard.state.store.id),
        eq(entitlements.customerId, guard.session.customerId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, message: "Bu ürün kütüphanenizde bulunamadı." };
  if (accessExpired(row.entitlement.expiresAt)) {
    return {
      ok: false,
      message: "Erişim süreniz doldu. Kod üretimi durduruldu, ürün kütüphanenizden kaldırıldı.",
    };
  }
  const account = row.account;
  if (!account) return { ok: false, message: "Bu ürüne atanmış bir hesap yok." };
  const steamSecret = account.steamSecret ? decryptData(account.steamSecret) : "";
  const totpSecret = account.totpSecret ? decryptData(account.totpSecret) : "";
  if (account.guardType === "steam_guard" && steamSecret) {
    return {
      ok: true,
      data: {
        code: generateSteamGuardCode(steamSecret),
        digits: 5,
        kind: "steam",
        secondsRemaining: secondsRemaining(),
        expiresAt: row.entitlement.expiresAt ? new Date(row.entitlement.expiresAt).toISOString() : null,
      },
    };
  }
  if (account.guardType === "totp" && totpSecret) {
    return {
      ok: true,
      data: {
        code: generateTotpCode(totpSecret),
        digits: 6,
        kind: "totp",
        secondsRemaining: secondsRemaining(),
        expiresAt: row.entitlement.expiresAt ? new Date(row.entitlement.expiresAt).toISOString() : null,
      },
    };
  }
  return { ok: false, message: "Bu hesap için 2FA/Guard kodu tanımlı değil." };
}

/** Shared helper used by the library page for "kalan süre" labels. */
export async function describeRemaining(expiresAt: Date | string | null): Promise<string> {
  return remainingLabel(expiresAt);
}
