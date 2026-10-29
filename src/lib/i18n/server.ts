import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  findLocale,
  negotiateLocale,
  type Locale,
} from "@/lib/i18n/config";
import { createTranslator, type Translator } from "@/lib/i18n/translate";

/**
 * Server-side locale resolution:
 *  1. explicit cookie set by the language switcher
 *  2. navigator.language (stored as `x-user-locale` by the client bootstrap)
 *  3. Accept-Language negotiation
 *  4. site default (Turkish)
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = findLocale(jar.get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;

  const headerStore = await headers();
  const fromClient = findLocale(headerStore.get("x-user-locale"));
  if (fromClient) return fromClient;

  const negotiated = negotiateLocale(headerStore.get("accept-language"));
  return negotiated ?? findLocale(DEFAULT_LOCALE)!;
}

export async function getTranslator(): Promise<{ locale: Locale; t: Translator }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale.code) };
}
