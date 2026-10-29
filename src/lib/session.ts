import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

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

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 7,
};

export async function setSessionCookie(name: string, payload: SessionPayload) {
  const jar = await cookies();
  jar.set(name, await sign(payload), cookieOptions);
}

export async function clearSessionCookie(name: string) {
  const jar = await cookies();
  jar.set(name, "", { ...cookieOptions, maxAge: 0 });
}

/** Short-lived ticket issued after the password step when 2FA is required. */
export async function setPendingSubject(subject: PendingSubject) {
  const jar = await cookies();
  const token = await new SignJWT({ ...subject })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey);
  jar.set(PENDING_COOKIE, token, { ...cookieOptions, maxAge: 600 });
}

export async function clearPendingSubject() {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, "", { ...cookieOptions, maxAge: 0 });
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
