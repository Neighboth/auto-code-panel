"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, findLocale } from "@/lib/i18n/config";
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

const subscribe = () => () => {};
const getSnapshot = () =>
  typeof document === "undefined" ? DEFAULT_LOCALE : document.documentElement.lang || DEFAULT_LOCALE;
const getServerSnapshot = () => DEFAULT_LOCALE;

export function I18nProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const value = findLocale(locale)?.code ?? DEFAULT_LOCALE;
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
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
  return useMemo(() => createTranslator(locale), [locale]);
}
