import { DICTIONARIES, REFERENCE_KEY_COUNT } from "@/lib/i18n/dictionaries";
import { CORE_KEYS } from "@/lib/i18n/core-packs";
import { LOCALES } from "@/lib/i18n/config";

export type CoverageStatus = "full" | "core" | "english";

export type LocaleCoverage = {
  code: string;
  nativeName: string;
  flag: string;
  translated: number;
  coreTranslated: number;
  status: CoverageStatus;
};

/**
 * Translation completeness per locale.
 *
 * `full`    – every reference key is translated (tr, en and any future pack),
 * `core`    – the complete customer-facing pack (navigation, auth, catalog),
 * `english` – no own dictionary yet, the UI renders English strings.
 */
export function localeCoverage(): LocaleCoverage[] {
  return LOCALES.map((locale) => {
    const dictionary = DICTIONARIES[locale.code] ?? {};
    const translated = Object.keys(dictionary).length;
    const coreTranslated = CORE_KEYS.filter((key) => Boolean(dictionary[key])).length;
    const status: CoverageStatus =
      translated >= REFERENCE_KEY_COUNT ? "full" : coreTranslated >= CORE_KEYS.length ? "core" : "english";
    return {
      code: locale.code,
      nativeName: locale.nativeName,
      flag: locale.flag,
      translated,
      coreTranslated,
      status,
    };
  });
}

export function coverageSummary() {
  const rows = localeCoverage();
  return {
    total: rows.length,
    referenceKeys: REFERENCE_KEY_COUNT,
    coreKeys: CORE_KEYS.length,
    full: rows.filter((row) => row.status === "full").length,
    core: rows.filter((row) => row.status === "core").length,
    english: rows.filter((row) => row.status === "english").length,
    rows,
  };
}

/** Status of a single locale, used by the language switcher badge. */
export function coverageFor(code: string): CoverageStatus {
  const base = code.split("-")[0];
  return localeCoverage().find((row) => row.code === base)?.status ?? "english";
}
