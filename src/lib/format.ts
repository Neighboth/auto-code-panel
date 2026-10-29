export function parsePrice(value: FormDataEntryValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}

export function formatMoney(
  value: string | number | null | undefined,
  currency = "TRY",
  locale = "tr-TR",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const symbols: Record<string, string> = {
    TRY: "₺",
    USD: "$",
    EUR: "€",
    GBP: "£",
    RUB: "₽",
    AED: "د.إ",
    SAR: "﷼",
    AZN: "₼",
    PLN: "zł",
    CHF: "CHF ",
    CAD: "C$",
    AUD: "A$",
    JPY: "¥",
    INR: "₹",
    BRL: "R$",
    UAH: "₴",
    KZT: "₸",
  };
  const symbol = symbols[(currency || "TRY").toUpperCase()] ?? `${currency} `;
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol.endsWith(" ") ? `${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function convertPrice(
  value: string | number | null | undefined,
  from: string,
  to: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  // Static snapshot kept for synchronous rendering paths. Server actions use
  // `convertAmount` from "@/lib/currency" which pulls live rates.
  const ratesToUsd: Record<string, number> = {
    USD: 1, EUR: 0.92, TRY: 42.4, GBP: 0.79, RUB: 92.5, AZN: 1.7,
  };
  const fromRate = ratesToUsd[(from || "USD").toUpperCase()] ?? 1;
  const toRate = ratesToUsd[(to || "USD").toUpperCase()] ?? 1;
  const converted = (num * fromRate) / toRate;
  return converted.toFixed(2);
}

export function discountPercent(original: string | number | null, ours: string | number | null): number | null {
  const o = Number(original);
  const w = Number(ours);
  if (!Number.isFinite(o) || !Number.isFinite(w) || o <= 0 || w <= 0) return null;
  if (w >= o) return null;
  return Math.round(((o - w) / o) * 100);
}

export const DURATION_PRESETS: { label: string; minutes: number | null }[] = [
  { label: "Süresiz / Sınırsız", minutes: null },
  { label: "1 Gün", minutes: 60 * 24 },
  { label: "2 Gün", minutes: 60 * 24 * 2 },
  { label: "3 Gün", minutes: 60 * 24 * 3 },
  { label: "1 Hafta", minutes: 60 * 24 * 7 },
  { label: "1 Ay", minutes: 60 * 24 * 30 },
  { label: "3 Ay", minutes: 60 * 24 * 90 },
  { label: "6 Ay", minutes: 60 * 24 * 180 },
  { label: "1 Yıl", minutes: 60 * 24 * 365 },
];

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Sınırsız erişim";
  const preset = DURATION_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `${minutes} dakika`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} saat`;
  return `${Math.round(minutes / (60 * 24))} gün`;
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

export function remainingLabel(target: Date | string | null | undefined): string {
  if (!target) return "Sınırsız";
  const date = typeof target === "string" ? new Date(target) : target;
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Süresi doldu";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  // Minutes are always part of the label: "2 gün 3 saat 14 dk" reads better than
  // a bare "2 gün 3 saat" and matches the "kalan süre" expectations.
  if (days > 0) return `${days} gün ${hours} saat ${minutes} dk`;
  if (hours > 0) return `${hours} saat ${minutes} dk ${seconds} sn`;
  if (minutes > 0) return `${minutes} dk ${seconds} sn`;
  return `${seconds} sn`;
}

/** Compact variant used in dense UI (badges, sidebars). */
export function remainingShort(target: Date | string | null | undefined): string {
  if (!target) return "Sınırsız";
  const date = typeof target === "string" ? new Date(target) : target;
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Süresi doldu";
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}g ${hours}s ${minutes}dk`;
  if (hours > 0) return `${hours}s ${minutes}dk`;
  return `${minutes} dk`;
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
