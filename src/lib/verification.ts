import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { emailVerifications } from "@/db/schema";
import { decryptData, encryptData } from "@/lib/secret-crypto";
import { randomToken } from "@/lib/crypto";
import { absoluteUrl } from "@/lib/mailer";
import { deliver, verificationTemplate } from "@/lib/mail-templates";
import { logAudit } from "@/lib/audit";

/**
 * E-mail verification challenges.
 *
 * A challenge contains:
 *  - a 6-digit code (stored encrypted so the magic link can *show* it),
 *  - an unguessable token used by the magic-link page,
 *  - a 15 minute expiry and an attempt counter.
 *
 * The link never verifies by itself — it only reveals the code, which the user
 * then types into the page they came from. That is the behaviour that keeps
 * transactional e-mail deliverability high ("this person really clicked").
 */

export type VerificationPurpose = "signup" | "login" | "change" | "totp";

export type CreateVerificationInput = {
  storeId: number;
  storeSlug: string;
  storeName: string;
  email: string;
  username: string;
  purpose: VerificationPurpose;
  customerId?: number | null;
  subjectType?: "customer" | "store" | "super";
  subjectId?: number | null;
  locale?: string;
};

export type CreatedVerification = {
  id: number;
  token: string;
  link: string;
  delivered: "sent" | "skipped" | "failed" | "duplicate";
  detail: string;
};

const TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 6;

function sixDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Creates a challenge and sends the e-mail. Throws only on DB failure. */
export async function createVerification(input: CreateVerificationInput): Promise<CreatedVerification> {
  await ensureDatabase();
  const code = sixDigits();
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + TTL_MS);

  const [row] = await db
    .insert(emailVerifications)
    .values({
      storeId: input.storeId,
      customerId: input.customerId ?? null,
      subjectType: input.subjectType ?? "customer",
      subjectId: input.subjectId ?? input.customerId ?? null,
      email: input.email,
      purpose: input.purpose,
      codeSecret: encryptData(code),
      token,
      expiresAt,
    })
    .returning({ id: emailVerifications.id });

  const link = absoluteUrl(`/${input.storeSlug}/dogrula?t=${token}`);
  const template = verificationTemplate({
    storeName: input.storeName,
    username: input.username,
    code,
    link,
    purpose: input.purpose === "signup" ? "signup" : input.purpose === "login" ? "login" : "signup",
    locale: input.locale,
  });
  const result = await deliver({
    to: input.email,
    template,
    kind: "verification",
    storeId: input.storeId,
    dedupeRef: `verification:${row.id}`,
  });

  await logAudit({
    action: "email.verification.sent",
    entity: "email_verification",
    entityId: row.id,
    storeId: input.storeId,
    summary: `${input.purpose} doğrulama kodu ${input.email} adresine gönderildi`,
    metadata: { purpose: input.purpose, status: result.status, detail: result.detail },
  });

  return { id: row.id, token, link, delivered: result.status, detail: result.detail };
}

export type VerificationLookup =
  | {
      ok: true;
      id: number;
      storeId: number;
      customerId: number | null;
      email: string;
      purpose: string;
      code: string;
      expiresAt: Date;
      used: boolean;
      expired: boolean;
    }
  | { ok: false; message: string };

/** Used by the magic-link page: resolves a token and decrypts the code. */
export async function lookupByToken(token: string): Promise<VerificationLookup> {
  await ensureDatabase();
  if (!token) return { ok: false, message: "Bağlantı geçersiz." };
  const rows = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, message: "Bağlantı bulunamadı veya iptal edilmiş." };
  const expired = new Date(row.expiresAt).getTime() <= Date.now();
  return {
    ok: true,
    id: row.id,
    storeId: row.storeId,
    customerId: row.customerId,
    email: row.email,
    purpose: row.purpose,
    code: decryptData(row.codeSecret),
    expiresAt: new Date(row.expiresAt),
    used: row.usedAt !== null,
    expired,
  };
}

export type VerifyOutcome =
  | { ok: true; storeId: number; customerId: number | null; email: string; purpose: string }
  | { ok: false; message: string };

/**
 * Checks a typed code. `selector` accepts either the numeric id or the magic
 * token so both flows (inline form and link round-trip) work.
 */
export async function consumeVerification(
  selector: { id?: number | null; token?: string | null },
  code: string,
): Promise<VerifyOutcome> {
  await ensureDatabase();
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmed)) return { ok: false, message: "6 haneli kodu girin." };

  const rows = selector.token
    ? await db.select().from(emailVerifications).where(eq(emailVerifications.token, selector.token)).limit(1)
    : selector.id
      ? await db.select().from(emailVerifications).where(eq(emailVerifications.id, selector.id)).limit(1)
      : [];
  const row = rows[0];
  if (!row) return { ok: false, message: "Doğrulama kaydı bulunamadı. Yeni kod isteyin." };
  if (row.usedAt) return { ok: false, message: "Bu kod zaten kullanıldı." };
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, message: "Kodun süresi doldu. Yeni kod isteyin." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, message: "Çok fazla hatalı deneme. Yeni kod isteyin." };
  }

  const expected = decryptData(row.codeSecret);
  if (expected !== trimmed) {
    await db
      .update(emailVerifications)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailVerifications.id, row.id));
    await logAudit({
      action: "email.verification.failed",
      entity: "email_verification",
      entityId: row.id,
      storeId: row.storeId,
      severity: "warn",
      summary: `Hatalı doğrulama kodu (${row.attempts + 1}/${MAX_ATTEMPTS})`,
    });
    return {
      ok: false,
      message: `Kod hatalı. Kalan deneme: ${Math.max(0, MAX_ATTEMPTS - row.attempts - 1)}`,
    };
  }

  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.id, row.id)));
  await logAudit({
    action: "email.verification.success",
    entity: "email_verification",
    entityId: row.id,
    storeId: row.storeId,
    summary: `${row.email} doğrulandı (${row.purpose})`,
  });
  return { ok: true, storeId: row.storeId, customerId: row.customerId, email: row.email, purpose: row.purpose };
}

/** Invalidates every pending challenge of a subject (e.g. after success). */
export async function clearPendingVerifications(subjectId: number, subjectType = "customer"): Promise<void> {
  await ensureDatabase();
  await db
    .delete(emailVerifications)
    .where(
      and(
        eq(emailVerifications.subjectId, subjectId),
        eq(emailVerifications.subjectType, subjectType),
        isNull(emailVerifications.usedAt),
      ),
    );
}
