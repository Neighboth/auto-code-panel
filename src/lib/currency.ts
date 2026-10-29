/**
 * Live currency conversion.
 *
 * Steam (and most marketplaces) return prices in their own currency. When a
 * tenant prices its catalogue in TRY the Steam price must be converted instead
 * of being copied as-is (a 59 USD game must not show up as 59 TRY).
 *
 * Rates are fetched from a public, key-less FX endpoint and cached for 6 hours.
 * When the network is unavailable we fall back to a static snapshot so pricing
 * keeps working offline. Rates are expressed "per 1 USD".
 */

export const CURRENCY_OPTIONS = [
  { code: "TRY", label: "x.turk-liras", symbol: "₺" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "RUB", label: "Russian Ruble", symbol: "₽" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
  { code: "AZN", label: "Azerbaijani Manat", symbol: "₼" },
  { code: "PLN", label: "Polish Złoty", symbol: "zł" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$" },
  { code: "UAH", label: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "KZT", label: "Kazakhstani Tenge", symbol: "₸" },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"] | string;

/** Fallback snapshot (per 1 USD). Only used when the FX API is unreachable. */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  TRY: 42.4,
  EUR: 0.92,
  GBP: 0.79,
  RUB: 92.5,
  AED: 3.67,
  SAR: 3.75,
  AZN: 1.7,
  PLN: 4.02,
  CHF: 0.88,
  CAD: 1.38,
  AUD: 1.53,
  JPY: 152,
  INR: 84.2,
  BRL: 5.72,
  UAH: 41.2,
  KZT: 487,
  MXN: 18.4,
  ZAR: 18.1,
  SEK: 10.7,
  NOK: 10.9,
  DKK: 6.9,
  CZK: 23.4,
  ILS: 3.72,
  EGP: 48.5,
  NGN: 1600,
  IDR: 15800,
  MYR: 4.45,
  SGD: 1.34,
  HKD: 7.78,
  CNY: 7.24,
  KRW: 1370,
  THB: 34.5,
  VND: 25400,
  PHP: 57.6,
  PKR: 278,
  QAR: 3.64,
  KWD: 0.31,
  GEL: 2.72,
};

type Cache = {
  rates: Record<string, number>;
  fetchedAt: number;
  source: "live" | "fallback";
};

const globalForFx = globalThis as typeof globalThis & { __fxCache?: Cache };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function fallbackRates(): Record<string, number> {
  return { ...FALLBACK_RATES };
}

export async function getUsdRates(): Promise<Cache> {
  const cached = globalForFx.__fxCache;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`FX HTTP ${response.status}`);
    const payload = (await response.json()) as { rates?: Record<string, number> };
    if (!payload.rates || typeof payload.rates.USD !== "number") throw new Error("FX payload");
    const cache: Cache = {
      rates: { ...FALLBACK_RATES, ...payload.rates, USD: 1 },
      fetchedAt: Date.now(),
      source: "live",
    };
    globalForFx.__fxCache = cache;
    return cache;
  } catch {
    return { rates: fallbackRates(), fetchedAt: Date.now(), source: "fallback" };
  }
}

export function convertWithRates(
  value: string | number | null | undefined,
  from: string,
  to: string,
  rates: Record<string, number>,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const fromCode = (from || "USD").toUpperCase();
  const toCode = (to || "USD").toUpperCase();
  if (fromCode === toCode) return num.toFixed(2);
  const fromRate = rates[fromCode] ?? FALLBACK_RATES[fromCode] ?? 1;
  const toRate = rates[toCode] ?? FALLBACK_RATES[toCode] ?? 1;
  if (!fromRate || !toRate) return num.toFixed(2);
  const converted = (num / fromRate) * toRate;
  // Guard against absurd results when a currency is unknown.
  if (!Number.isFinite(converted) || converted < 0) return num.toFixed(2);
  return converted.toFixed(2);
}

export async function convertAmount(
  value: string | number | null | undefined,
  from: string,
  to: string,
): Promise<string | null> {
  const { rates } = await getUsdRates();
  return convertWithRates(value, from, to, rates);
}

export function currencySymbol(code: string): string {
  return CURRENCY_OPTIONS.find((item) => item.code === code.toUpperCase())?.symbol ?? `${code} `;
}
