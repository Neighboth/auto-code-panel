import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { mailPreferences } from "@/db/schema";
import { env } from "@/lib/env";
import { absoluteUrl } from "@/lib/mailer";

/**
 * E-mail notification preferences (KVKK / GDPR).
 *
 * Defaults are "on": transactional mail (delivery receipts, license warnings)
 * is part of the service. Marketing-ish mail (announcements) can be switched off
 * from the profile page, and every message carries a one-click unsubscribe link
 * that only affects the addressed mailbox.
 */

export type MailAudience = "customer" | "store_admin";
export type MailPrefKind = "announcements" | "delivery" | "license" | "security";
export type MailPrefs = Record<MailPrefKind, boolean>;
export type MailPreferenceUpdate = Partial<MailPrefs>;

export const DEFAULT_PREFS: MailPrefs = {
  announcements: true,
  delivery: true,
  license: true,
  security: true,
};

const KINDS: MailPrefKind[] = ["announcements", "delivery", "license", "security"];

function normalize(row: Partial<MailPrefs> | undefined): MailPrefs {
  const prefs = { ...DEFAULT_PREFS };
  if (!row) return prefs;
  for (const kind of KINDS) {
    const value = row[kind];
    if (typeof value === "boolean") prefs[kind] = value;
  }
  return prefs;
}

/** Reads the stored preferences; a missing row means "all on". */
export async function getMailPrefs(audience: MailAudience, subjectId: number): Promise<MailPrefs> {
  await ensureDatabase();
  const rows = await db
    .select()
    .from(mailPreferences)
    .where(and(eq(mailPreferences.audience, audience), eq(mailPreferences.subjectId, subjectId)))
    .limit(1);
  return normalize(rows[0]);
}

export async function allowsMail(
  audience: MailAudience,
  subjectId: number | null,
  kind: MailPrefKind,
): Promise<boolean> {
  if (!subjectId) return true;
  const prefs = await getMailPrefs(audience, subjectId);
  return prefs[kind] !== false;
}

/** Upserts a partial preference patch. */
export async function setMailPrefs(
  audience: MailAudience,
  subjectId: number,
  patch: Partial<MailPrefs>,
  meta: { email?: string | null; storeId?: number | null } = {},
): Promise<MailPrefs> {
  await ensureDatabase();
  const current = await getMailPrefs(audience, subjectId);
  const next = normalize({ ...current, ...patch });
  const values = {
    audience,
    subjectId,
    email: meta.email ?? "",
    storeId: meta.storeId ?? null,
    ...next,
    updatedAt: new Date(),
  };
  await db
    .insert(mailPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: [mailPreferences.audience, mailPreferences.subjectId],
      set: { ...next, updatedAt: new Date() },
    });
  return next;
}

/* ------------------------------- Tokens ------------------------------- */

const SECRET = env.authSecret;

function sign(audience: MailAudience, subjectId: number): string {
  return createHmac("sha256", SECRET)
    .update(`mail-pref:${audience}:${subjectId}`)
    .digest("base64url")
    .slice(0, 32);
}

/** Signed, stateless unsubscribe token: `customer.42.signature`. */
export function unsubscribeToken(audience: MailAudience, subjectId: number): string {
  return `${audience === "customer" ? "c" : "a"}.${subjectId}.${sign(audience, subjectId)}`;
}

export function readUnsubscribeToken(token: string | null | undefined): { audience: MailAudience; subjectId: number } | null {
  if (!token) return null;
  const [prefix, idRaw, signature] = token.split(".");
  const audience: MailAudience | null = prefix === "c" ? "customer" : prefix === "a" ? "store_admin" : null;
  const subjectId = Number(idRaw);
  if (!audience || !Number.isInteger(subjectId) || subjectId <= 0 || !signature) return null;
  const expected = Buffer.from(sign(audience, subjectId));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { audience, subjectId };
}

export function unsubscribeUrl(audience: MailAudience, subjectId: number): string {
  return absoluteUrl(`/abonelik?t=${encodeURIComponent(unsubscribeToken(audience, subjectId))}`);
}
