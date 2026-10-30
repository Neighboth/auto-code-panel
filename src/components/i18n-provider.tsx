"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, findLocale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { createTranslator, type Translator } from "@/lib/i18n/translate";

/**
 * Client-side locale context.
 *
 * Server components resolve the locale (cookie → browser language → Accept-Language)
 * and pass it to this provider once, in the root layout. Client components that are
 * rendered deep in the tree (modal, copy button, language switcher) can then call
 * `useT()` without threading a `locale` prop through every intermediate component.
 *
 * When no provider is mounted the hook reads `<html lang>` from the DOM, so nested
 * providers are optional.
 */
const LocaleContext = createContext<string | null>(null);
/**
 * The complete pack for the active locale, sent once from the server. Client
 * components must never import the packs themselves (they are megabytes).
 */
const DictionaryContext = createContext<Dictionary | null>(null);

const subscribe = () => () => {};
const getSnapshot = () =>
  typeof document === "undefined" ? DEFAULT_LOCALE : document.documentElement.lang || DEFAULT_LOCALE;
const getServerSnapshot = () => DEFAULT_LOCALE;

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: string;
  dictionary?: Dictionary;
  children: ReactNode;
}) {
  const value = findLocale(locale)?.code ?? DEFAULT_LOCALE;
  return (
    <LocaleContext.Provider value={value}>
      <DictionaryContext.Provider value={dictionary ?? null}>{children}</DictionaryContext.Provider>
    </LocaleContext.Provider>
  );
}

/** Active locale code for client components. */
export function useLocale(): string {
  const fromProvider = useContext(LocaleContext);
  const fromDom = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return fromProvider ?? fromDom;
}

/** Translator bound to the active locale (missing keys fall back to English). */
export function useT(): Translator {
  const locale = useLocale();
  const dictionary = useContext(DictionaryContext);
  return useMemo(() => createTranslator(locale, dictionary ?? undefined), [locale, dictionary]);
}
