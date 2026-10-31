import { createTranslator, type Translator } from "@/lib/i18n/translate";

/** Turkish translator used when a caller does not pass one in. */
const tr = createTranslator("tr");

export function parsePrice(value: FormDataEntryValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}

/**
 * Prices are rendered with `Intl` in the *currency's* own convention: symbol
 * placement, group separator and decimals all come from CLDR (JPY has none,
 * KWD has three), so a Saudi riyal is never printed as "﷼12.345".
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = "TRY",
  locale = "tr-TR",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const code = (currency || "TRY").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).format(num);
  } catch {
    return `${code} ${num.toFixed(2)}`;
  }
}

export function convertPrice(
  value: string | number | null | undefined,
  from: string,
  to: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  /*
   * Sync path only. Server actions use `convertAmount` (live FX); a currency the
   * snapshot does not know returns null instead of being treated as USD, so a
   * price is never silently off by a factor.
   */
  const ratesToUsd: Record<string, number> = {
    USD: 1, EUR: 0.92, TRY: 42.4, GBP: 0.79, RUB: 92.5, AZN: 1.7,
    JPY: 152, CNY: 7.24, INR: 84.2, BRL: 5.72, CAD: 1.38, AUD: 1.53,
    CHF: 0.88, PLN: 4.02, UAH: 41.2, KZT: 487, AED: 3.67, SAR: 3.75,
    MXN: 18.4, ZAR: 18.1, SEK: 10.7, NOK: 10.9, DKK: 6.9, CZK: 23.4,
    ILS: 3.72, EGP: 48.5, NGN: 1600, IDR: 15800, MYR: 4.45, SGD: 1.34,
    HKD: 7.78, KRW: 1370, THB: 34.5, VND: 25400, PHP: 57.6, PKR: 278,
    QAR: 3.64, KWD: 0.31, GEL: 2.72,
  };
  const fromRate = ratesToUsd[(from || "USD").toUpperCase()];
  const toRate = ratesToUsd[(to || "USD").toUpperCase()];
  if (!fromRate || !toRate) return null;
  return ((num * fromRate) / toRate).toFixed(2);
}

export function discountPercent(original: string | number | null, ours: string | number | null): number | null {
  const o = Number(original);
  const w = Number(ours);
  if (!Number.isFinite(o) || !Number.isFinite(w) || o <= 0 || w <= 0) return null;
  if (w >= o) return null;
  return Math.round(((o - w) / o) * 100);
}

export const DURATION_PRESETS: { label: string; minutes: number | null }[] = [
  { label: "x.suresiz-snrsz", minutes: null },
  { label: "x.1-gun", minutes: 60 * 24 },
  { label: "x.2-gun", minutes: 60 * 24 * 2 },
  { label: "x.3-gun", minutes: 60 * 24 * 3 },
  { label: "x.1-hafta", minutes: 60 * 24 * 7 },
  { label: "x.1-ay", minutes: 60 * 24 * 30 },
  { label: "x.3-ay", minutes: 60 * 24 * 90 },
  { label: "x.6-ay", minutes: 60 * 24 * 180 },
  { label: "x.1-yl", minutes: 60 * 24 * 365 },
];

export function formatDuration(minutes: number | null, t: Translator = tr): string {
  if (minutes === null) return t("x.snrsz-erisim");
  const preset = DURATION_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return t(preset.label);
  if (minutes < 60) return `${minutes} ${t("x.dakika")}`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} ${t("x.saat")}`;
  return `${Math.round(minutes / (60 * 24))} ${t("x.gun")}`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function remainingLabel(target: Date | string | null | undefined, t: Translator = tr): string {
  if (!target) return t("x.snrsz");
  const date = typeof target === "string" ? new Date(target) : target;
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return t("x.suresi-doldu");
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  // Minutes are always part of the label: t("x.2-gun-3-saat-14-dk") reads better than
  // a bare t("x.2-gun-3-saat") and matches the t("x.kalan-sure") expectations.
  if (days > 0) return `${days} ${t("x.gun")} ${hours} ${t("x.saat")} ${minutes} ${t("x.dk")}`;
  if (hours > 0) return `${hours} ${t("x.saat")} ${minutes} ${t("x.dk")} ${seconds} ${t("x.sn")}`;
  if (minutes > 0) return `${minutes} ${t("x.dk")} ${seconds} ${t("x.sn")}`;
  return `${seconds} ${t("x.sn")}`;
}

/** Compact variant used in dense UI (badges, sidebars). */
export function remainingShort(target: Date | string | null | undefined, t: Translator = tr): string {
  if (!target) return t("x.snrsz");
  const date = typeof target === "string" ? new Date(target) : target;
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return t("x.suresi-doldu");
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}${t("x.g")} ${hours}${t("x.s")} ${minutes}${t("x.dk")}`;
  if (hours > 0) return `${hours}${t("x.s")} ${minutes}${t("x.dk")}`;
  return `${minutes} ${t("x.dk")}`;
}

export function accessExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false;
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return date.getTime() <= Date.now();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const RESERVED_SLUGS = new Set([
  "api",
  "bayi",
  "super-admin",
  "admin",
  "static",
  "_next",
  "kutuphane",
  "oyunlar",
  "kod-gir",
  "profil",
  "giris",
  "kayit",
]);

/** Masks the local part of an address for logs: `de***@example.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}
