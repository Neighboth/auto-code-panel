import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { convertPrice } from "@/lib/format";

export type SteamPriceInfo = {
  currency: string;
  initial: number;
  final: number;
  discountPercent: number;
};

export type SteamAppDetails = {
  appId: string;
  title: string;
  headerImage: string;
  shortDescription: string;
  originalPrice: number | null;
  finalPrice: number | null;
  currency: string;
  isFree: boolean;
};

export function parseSteamAppId(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  const rawId = /^\d+$/.test(value) ? value : null;
  if (rawId) return rawId;
  const match = value.match(/store\.steampowered\.com\/app\/(\d+)/i) ?? value.match(/\/app\/(\d+)/i);
  return match ? match[1] : null;
}

function normalizePrice(cents: number | undefined | null): number | null {
  if (cents === undefined || cents === null || !Number.isFinite(cents)) return null;
  return Math.round(cents) / 100;
}

export async function fetchSteamAppDetails(appId: string): Promise<SteamAppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=tr&l=turkish`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<
      string,
      {
        success: boolean;
        data?: {
          name: string;
          header_image: string;
          short_description?: string;
          is_free?: boolean;
          price_overview?: SteamPriceInfo;
        };
      }
    >;
    const entry = payload[appId];
    if (!entry?.success || !entry.data) return null;
    const price = entry.data.price_overview;
    return {
      appId,
      title: entry.data.name,
      headerImage: entry.data.header_image,
      shortDescription: entry.data.short_description ?? "",
      originalPrice: normalizePrice(price?.initial),
      finalPrice: normalizePrice(price?.final),
      currency: price?.currency ?? "TRY",
      isFree: Boolean(entry.data.is_free),
    };
  } catch {
    return null;
  }
}

export type SteamSyncResult = {
  checked: number;
  updated: number;
  failed: number;
  errors: string[];
};

/** Refreshes title, cover art and the official Steam price for every auto-sync product. */
export async function syncSteamGames(storeId?: number, limit = 40): Promise<SteamSyncResult> {
  const rows = storeId
    ? await db
        .select()
        .from(games)
        .where(and(eq(games.autoSync, true), eq(games.storeId, storeId)))
        .limit(limit)
    : await db.select().from(games).where(eq(games.autoSync, true)).limit(limit);

  const result: SteamSyncResult = { checked: 0, updated: 0, failed: 0, errors: [] };
  for (const game of rows) {
    const appId = game.steamAppId ?? parseSteamAppId(game.steamUrl);
    if (!appId) continue;
    result.checked += 1;
    const details = await fetchSteamAppDetails(appId);
    if (!details) {
      result.failed += 1;
      if (result.errors.length < 5) result.errors.push(`${game.title}: Steam yanıtı alınamadı`);
      continue;
    }
    await db
      .update(games)
      .set({
        title: details.title || game.title,
        coverImage: details.headerImage || game.coverImage,
        steamAppId: appId,
        originalPrice:
          details.originalPrice !== null
            ? convertPrice(details.originalPrice, details.currency, game.currency)
            : details.isFree
              ? "0.00"
              : game.originalPrice,
        originalCurrency: details.originalPrice !== null ? game.currency : details.currency,
        description: game.description || details.shortDescription,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(games.id, game.id), eq(games.storeId, game.storeId)));
    result.updated += 1;
  }
  return result;
}
