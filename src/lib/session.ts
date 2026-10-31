import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { SESSION_MAX_AGE, sessionCookieOptions } from "@/lib/cookie-policy";

export const SUPER_COOKIE = "kr_super";
export const STORE_COOKIE = "kr_store";
export const CUSTOMER_COOKIE = "kr_customer";
export const PENDING_COOKIE = "kr_pending";

export type PendingSubject =
  | { t: "super"; id: number; slug?: never; storeId?: never; username: string }
  | { t: "store"; id: number; storeId: number; slug: string; username: string }
  | { t: "customer"; id: number; storeId: number; slug: string; username: string };

export type SuperSession = { kind: "super"; id: number; username: string };
export type StoreAdminSession = {
  kind: "store";
  storeId: number;
  adminId: number;
  username: string;
  slug: string;
};
export type CustomerSession = {
  kind: "customer";
  storeId: number;
  customerId: number;
  username: string;
};

type SessionPayload = SuperSession | StoreAdminSession | CustomerSession;

const secretKey = new TextEncoder().encode(env.authSecret);

async function sign(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

async function verify<T extends SessionPayload>(token: string | undefined, kind: T["kind"]): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.kind !== kind) return null;
    return payload as unknown as T;
  } catch {
    return null;
  }
}

/**
 * Cookie attributes are decided per request (https? embedded frame?) — see
 * `lib/cookie-policy.ts`. A build-time flag made sign-in impossible over plain
 * http and inside an embedded preview.
 */
async function cookieOptions(maxAge = SESSION_MAX_AGE) {
  return { ...(await sessionCookieOptions()), httpOnly: true, maxAge };
}

export async function setSessionCookie(name: string, payload: SessionPayload) {
  const jar = await cookies();
  jar.set(name, await sign(payload), await cookieOptions());
}

export async function clearSessionCookie(name: string) {
  const jar = await cookies();
  jar.set(name, "", await cookieOptions(0));
}

/**
 * Whether the browser actually kept the cookie we just set.
 *
 * Login flows call this after a successful credential check: when the cookie is
 * refused (third-party cookie blocking, `Secure` over http, an aggressive
 * privacy extension) the user would otherwise be sent to the panel only to be
 * bounced back to the login form. Reporting it turns a mystery loop into a
 * message with a fix.
 */
export async function sessionVisible(kind: "super" | "store" | "customer"): Promise<boolean> {
  const jar = await cookies();
  const name = kind === "super" ? SUPER_COOKIE : kind === "store" ? STORE_COOKIE : CUSTOMER_COOKIE;
  return Boolean(jar.get(name)?.value);
}

/** Short-lived ticket issued after the password step when 2FA is required. */
export async function setPendingSubject(subject: PendingSubject) {
  const jar = await cookies();
  const token = await new SignJWT({ ...subject })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey);
  jar.set(PENDING_COOKIE, token, await cookieOptions(600));
}

export async function clearPendingSubject() {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, "", await cookieOptions(0));
}

export async function getPendingSubject(): Promise<PendingSubject | null> {
  const jar = await cookies();
  try {
    const { payload } = await jwtVerify(jar.get(PENDING_COOKIE)?.value ?? "", secretKey);
    if (payload.t !== "super" && payload.t !== "store" && payload.t !== "customer") return null;
    return payload as unknown as PendingSubject;
  } catch {
    return null;
  }
}

export async function getSuperSession(): Promise<SuperSession | null> {
  const jar = await cookies();
  return verify<SuperSession>(jar.get(SUPER_COOKIE)?.value, "super");
}

export async function getStoreAdminSession(): Promise<StoreAdminSession | null> {
  const jar = await cookies();
  return verify<StoreAdminSession>(jar.get(STORE_COOKIE)?.value, "store");
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const jar = await cookies();
  return verify<CustomerSession>(jar.get(CUSTOMER_COOKIE)?.value, "customer");
}
