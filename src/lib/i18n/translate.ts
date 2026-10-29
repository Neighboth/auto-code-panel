import { dictionaryFor } from "@/lib/i18n/dictionaries";
import { TEXT_EN } from "@/lib/i18n/ui-extra";
import { DEFAULT_LOCALE, findLocale } from "@/lib/i18n/config";
import { normalizeTag } from "@/lib/i18n/helpers";

export type TranslateParams = Record<string, string | number>;

/**
 * `t("some.key")`, `t("some.key", "fallback text")` or
 * `t("some.key", { name: value })` where the dictionary text uses `{name}`.
 */
export type Translator = (key: string, paramsOrFallback?: TranslateParams | string) => string;

/**
 * Builds a synchronous translator for the given locale. Missing keys fall back
 * to English and finally to the key itself (or the provided fallback text).
 */
export function createTranslator(locale: string): Translator {
  const primary = dictionaryFor(locale);
  const base = dictionaryFor("en");
  const defaultDict = dictionaryFor(DEFAULT_LOCALE);
  // Last chance fallback: some data structures (feature lists, duration presets)
  // keep their Turkish source text as the key. `TEXT_EN` maps that literal to
  // English, so rendering `t(value)` never leaks Turkish into a non-Turkish UI.
  const text = locale === DEFAULT_LOCALE ? {} : TEXT_EN;
  return (key: string, paramsOrFallback?: TranslateParams | string) => {
    const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : undefined;
    const raw = primary[key] ?? base[key] ?? defaultDict[key] ?? text[key] ?? fallback ?? key;
    if (!paramsOrFallback || typeof paramsOrFallback === "string") return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in paramsOrFallback ? String(paramsOrFallback[name]) : match,
    );
  };
}

export function localeInfo(locale: string) {
  return findLocale(normalizeTag(locale)) ?? findLocale(DEFAULT_LOCALE)!;
}
