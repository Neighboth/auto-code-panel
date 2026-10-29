import { LOCALES, type Locale } from "@/lib/i18n/config";

export function normalizeTag(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace("_", "-");
}

export function localeLabel(locale: Locale): string {
  return locale.nativeName || locale.name || locale.code;
}

export { LOCALES };
export type { Locale };
