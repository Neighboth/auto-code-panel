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

/**
 * Every currency the payment world actually uses.
 *
 * The ISO-4217 active list is kept as codes only: the English name, the narrow
 * symbol and the number of decimals are derived from `Intl` at runtime, so the
 * list is always internally consistent (JPY has 0 decimals, KWD 3, and the
 * symbol for an obscure currency is still the one the CLDR ships). When `Intl`
 * cannot answer (very old runtime) the code itself is shown — never a wrong
 * symbol.
 */
export const CURRENCY_CODES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
  "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD",
  "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR",
  "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF",
  "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL",
  "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR",
  "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR",
  "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR",
  "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD",
  "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB",
  "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX",
  "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF",
  "XPF", "YER", "ZAR", "ZMW", "ZWL",
] as const;

/** Symbols CLDR renders as the bare code; a spoken form reads better in a select. */
const SYMBOL_OVERRIDES: Record<string, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  RUB: "₽",
  AZN: "₼",
  KZT: "₸",
  UAH: "₴",
  INR: "₹",
  BRL: "R$",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  BGN: "лв",
  GEL: "₾",
  ILS: "₪",
  SAR: "﷼",
  AED: "د.إ",
  QAR: "ر.ق",
  KWD: "د.ك",
  EGP: "E£",
  NGN: "₦",
  ZAR: "R",
  MXN: "MX$",
  ARS: "AR$",
  CLP: "CLP$",
  COP: "COL$",
  PHP: "₱",
  THB: "฿",
  VND: "₫",
  IDR: "Rp",
  MYR: "RM",
  SGD: "S$",
  HKD: "HK$",
  TWD: "NT$",
  PKR: "₨",
  BDT: "৳",
  LKR: "Rs",
  NPR: "₨",
  IRR: "﷼",
  IQD: "ع.د",
  JOD: "د.ا",
  LBP: "ل.ل",
  MAD: "د.م.",
  TND: "د.ت",
  DZD: "دج",
  BHD: "د.ب",
  OMR: "ر.ع.",
  KES: "KSh",
  UGX: "USh",
  TZS: "TSh",
  GHS: "₵",
  XOF: "CFA",
  XAF: "FCFA",
  XPF: "₣",
};

export type CurrencyOption = {
  code: string;
  /** English display name (`Intl.DisplayNames`), e.g. "Turkish Lira". */
  label: string;
  symbol: string;
  /** Fraction digits used by the currency (0 for JPY, 3 for KWD…). */
  decimals: number;
};

function currencyDecimals(code: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function currencySymbol(code: string): string {
  if (SYMBOL_OVERRIDES[code]) return SYMBOL_OVERRIDES[code];
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

function currencyName(code: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "currency" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Full, `Intl`-derived currency table (codes stay in ISO order). */
export const CURRENCY_OPTIONS: CurrencyOption[] = CURRENCY_CODES.map((code) => ({
  code,
  label: currencyName(code),
  symbol: currencySymbol(code),
  decimals: currencyDecimals(code),
}));

/** Symbols that need a space before the number (e.g. "CHF 12.00"). */
export function currencyFormat(code: string, value: number, locale = "en"): string {
  try {
    /*
     * `narrowSymbol` collapses ambiguous currencies (KWD, SAR, IRR…) to the bare
     * code, so the explicit symbol is written the way the currency's own
     * convention does it, with CLDR handling the number part.
     */
    const upper = code.toUpperCase();
    const number = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: upper,
      currencyDisplay: "narrowSymbol",
    }).format(value);
    const override = SYMBOL_OVERRIDES[upper];
    if (!override) return number;
    return number.replace(/[A-Z]{3}|\p{Sc}/u, override).replace(/\s{2,}/g, " ").trim();
  } catch {
    return `${value} ${code}`;
  }
}

export type CurrencyCode = (typeof CURRENCY_CODES)[number] | (string & {});

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
  const fromRate = rates[fromCode] ?? FALLBACK_RATES[fromCode];
  const toRate = rates[toCode] ?? FALLBACK_RATES[toCode];
  /*
   * A missing rate used to be treated as 1, which silently produced a price off
   * by a factor of 30 (a 60 USD game stored as 60 TRY). Returning null lets the
   * caller keep the original value instead of writing a wrong price.
   */
  if (!fromRate || !toRate) return null;
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

/** Narrow symbol for `code` (falls back to the code itself). */
export function currencySymbolOf(code: string): string {
  const upper = (code || "USD").toUpperCase();
  return CURRENCY_OPTIONS.find((item) => item.code === upper)?.symbol ?? upper;
}
