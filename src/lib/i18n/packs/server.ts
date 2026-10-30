import { dictionaryFor, type Dictionary } from "@/lib/i18n/dictionaries";
import { FULL_PACKS } from "@/lib/i18n/packs";
import { createTranslator, type Translator } from "@/lib/i18n/translate";

/**
 * Server-side access to the complete machine-translated packs.
 *
 * The packs are ~78 × 1600 strings, so they must never reach the browser
 * bundle: `dictionaries.ts` (which every client component can import) only
 * carries the reference languages and the hand-written core packs. Server
 * components and actions merge the full pack in through this module, and the
 * root layout hands the resulting dictionary to `I18nProvider` as a prop, so
 * client components get the same text without the weight.
 */
export function serverDictionary(locale: string): Dictionary {
  const base = String(locale ?? "").split("-")[0];
  return FULL_PACKS[base] ?? {};
}

/** Translator with the complete pack for `locale` layered over the dictionary. */
export function createServerTranslator(locale: string): Translator {
  return createTranslator(locale, serverDictionary(locale));
}

/** Exported for tests/tools that only need the resolved dictionary. */
export { dictionaryFor };
