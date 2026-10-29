import { dictionaryFor } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, findLocale } from "@/lib/i18n/config";
import { normalizeTag } from "@/lib/i18n/helpers";

export type Translator = (key: string, fallback?: string) => string;

/**
 * Builds a synchronous translator for the given locale. Missing keys fall back
 * to English and finally to the key itself (or the provided fallback text).
 */
export function createTranslator(locale: string): Translator {
  const primary = dictionaryFor(locale);
  const base = dictionaryFor("en");
  const defaultDict = dictionaryFor(DEFAULT_LOCALE);
  return (key: string, fallback?: string) =>
    primary[key] ?? base[key] ?? defaultDict[key] ?? fallback ?? key;
}

export function localeInfo(locale: string) {
  return findLocale(normalizeTag(locale)) ?? findLocale(DEFAULT_LOCALE)!;
}
