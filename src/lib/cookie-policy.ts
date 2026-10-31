import { headers } from "next/headers";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * Cookie policy for the session cookies.
 *
 * Two things used to make sign-in bounce straight back to the login form:
 *
 * 1. `secure` was hardcoded to `NODE_ENV === "production"`. A production build
 *    served over plain http (a LAN address such as http://192.168.1.20:3000, or
 *    a domain without TLS yet) therefore sent `Set-Cookie: …; Secure`, which the
 *    browser silently discards. The credentials were accepted, the redirect
 *    followed, and the panel asked to sign in again.
 * 2. `sameSite: "lax"` is dropped when the page is rendered inside a third-party
 *    iframe (which is exactly how an embedded preview shows the app). Nothing
 *    was stored, so every navigation looked unauthenticated.
 *
 * The policy is derived from the *actual request* instead of a build flag:
 * `Secure` only when the request arrived over https, and `SameSite=None;
 * Partitioned` (CHIPS) when the request is a cross-site frame — the modern way
 * to keep a session inside an embedded preview.
 */

type CookiePolicy = Pick<ResponseCookie, "secure" | "sameSite" | "path" | "partitioned">;

function firstHeader(value: string | null): string {
  return (value ?? "").split(",")[0].trim().toLowerCase();
}

/** True when the browser reached us over https (direct or via a proxy). */
export async function isSecureRequest(): Promise<boolean> {
  const store = await headers();
  const proto = firstHeader(store.get("x-forwarded-proto"));
  if (proto) return proto === "https";
  if (store.get("x-forwarded-ssl") === "on") return true;
  // No proxy headers: a direct connection. `https:` would only appear here if the
  // Node server itself terminated TLS, which it does not.
  return false;
}

/**
 * True when the page is a cross-site frame. `Sec-Fetch-Site` is the reliable
 * signal (every current browser sends it); `Sec-Fetch-Dest: iframe` covers the
 * remaining cases and the explicit embedding hints some previews add.
 */
export async function isCrossSiteFrame(): Promise<boolean> {
  const store = await headers();
  const site = firstHeader(store.get("sec-fetch-site"));
  const dest = firstHeader(store.get("sec-fetch-dest"));
  if (site === "cross-site") return true;
  if (site === "same-site" && dest === "iframe") return true;
  if (dest === "iframe" && store.get("x-embedded") === "1") return true;
  return false;
}

/**
 * Options for every session/pending cookie.
 *
 * `SameSite=None` is only legal together with `Secure`, so an embedded frame on
 * plain http falls back to `Lax` (nothing else can work there) — the login form
 * then shows the "open in a new tab" hint instead of looping.
 */
export async function sessionCookieOptions(): Promise<CookiePolicy> {
  const secure = await isSecureRequest();
  const embedded = await isCrossSiteFrame();
  if (embedded && secure) {
    return { path: "/", secure: true, sameSite: "none", partitioned: true };
  }
  return { path: "/", secure, sameSite: "lax" };
}

/** Lifetime of the session cookies. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
