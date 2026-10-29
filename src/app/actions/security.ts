"use server";

import { getTranslator } from "@/lib/i18n/server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { authenticator } from "otplib";
import { and, eq } from "drizzle-orm";
import { db, ensureDatabase } from "@/db";
import { securityFactors } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { brand } from "@/lib/brand";
import { hitRateLimit, recordSuccess } from "@/lib/rate-limit";
import {
  CUSTOMER_COOKIE,
  STORE_COOKIE,
  SUPER_COOKIE,
  clearPendingSubject,
  clearSessionCookie,
  getPendingSubject,
  getSuperSession,
  setSessionCookie,
  type PendingSubject,
} from "@/lib/session";
import { requireCustomer, requireStoreAdmin } from "@/lib/tenant";
import { customers, storeAdmins, stores } from "@/db/schema";
import { env, mailVerificationEnabled, smtpConfigured } from "@/lib/env";
import { createVerification, consumeVerification } from "@/lib/verification";
import { logAudit } from "@/lib/audit";
import { deliver, securityTemplate } from "@/lib/mail-templates";
import { decryptData, encryptData } from "@/lib/secret-crypto";
import { consumeChallenge, issueChallenge, verifyAssertion, type StoredPasskey } from "@/lib/webauthn";
import type { ActionResult } from "@/lib/types";

const KINDS = ["totp", "passkey", "question", "email"] as const;
type Kind = (typeof KINDS)[number];
type SubjectType = "super" | "store" | "customer";

authenticator.options = { window: 1 };

function refresh(slug?: string) {
  revalidatePath("/super-admin/ayarlar");
  if (slug) {
    revalidatePath(`/${slug}`, "layout");
    revalidatePath(`/${slug}/admin/ayarlar`);
  }
}

async function currentSubject(slug: string, subjectType: SubjectType) {
  if (subjectType === "super") {
    const session = await getSuperSession();
    if (!session) return null;
    return { type: "super" as const, id: 1, username: session.username, slug: "" };
  }
  if (subjectType === "store") {
    const guard = await requireStoreAdmin(slug);
    if (!guard) return null;
    return { type: "store" as const, id: guard.session.adminId, username: guard.session.username, slug };
  }
  const guard = await requireCustomer(slug);
  if (!guard) return null;
  return { type: "customer" as const, id: guard.session.customerId, username: guard.session.username, slug };
}

/** E-mail address a 2FA code can be sent to, per subject type. */
async function subjectEmail(subjectType: SubjectType, subjectId: number): Promise<{ email: string; name: string; storeName: string; storeSlug: string } | null> {
  if (subjectType === "customer") {
    const rows = await db
      .select({ customer: customers, store: stores })
      .from(customers)
      .innerJoin(stores, eq(stores.id, customers.storeId))
      .where(eq(customers.id, subjectId))
      .limit(1);
    const row = rows[0];
    if (!row?.customer.email) return null;
    return { email: row.customer.email, name: row.customer.username, storeName: row.store.name, storeSlug: row.store.slug };
  }
  if (subjectType === "store") {
    const rows = await db
      .select({ admin: storeAdmins, store: stores })
      .from(storeAdmins)
      .innerJoin(stores, eq(stores.id, storeAdmins.storeId))
      .where(eq(storeAdmins.id, subjectId))
      .limit(1);
    const row = rows[0];
    if (!row?.admin.email) return null;
    return { email: row.admin.email, name: row.admin.username, storeName: row.store.name, storeSlug: row.store.slug };
  }
  const email = env.superAdminEmail;
  if (!email) return null;
  return { email, name: "super admin", storeName: "Platform", storeSlug: "" };
}

async function factorRow(subjectType: SubjectType, subjectId: number, kind: Kind) {
  const rows = await db
    .select()
    .from(securityFactors)
    .where(and(eq(securityFactors.subjectType, subjectType), eq(securityFactors.subjectId, subjectId), eq(securityFactors.kind, kind)))
    .limit(1);
  return rows[0] ?? null;
}

async function saveFactor(subjectType: SubjectType, subjectId: number, kind: Kind, data: string) {
  await db
    .insert(securityFactors)
    .values({ subjectType, subjectId, kind, data })
    .onConflictDoUpdate({
      target: [securityFactors.subjectType, securityFactors.subjectId, securityFactors.kind],
      set: { data },
    });
}

/* ------------------------------ Management ------------------------------ */

export async function listFactors(
  slug: string,
  subjectType: SubjectType,
): Promise<
  ActionResult<{
    totp: boolean;
    passkey: boolean;
    question: boolean;
    email: boolean;
    emailAddress: string;
    questionText: string;
  }>
> {
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "x.oturum-bulunamad" };
  const totp = !!(await factorRow(subjectType, subject.id, "totp"));
  const passkey = !!(await factorRow(subjectType, subject.id, "passkey"));
  const emailRow = await factorRow(subjectType, subject.id, "email");
  const emailTarget = await subjectEmail(subjectType, subject.id);
  const questionRow = await factorRow(subjectType, subject.id, "question");
  let questionText = "";
  if (questionRow) {
    try {
      questionText = (JSON.parse(questionRow.data) as { question: string }).question ?? "";
    } catch {
      questionText = "";
    }
  }
  return {
    ok: true,
    data: {
      totp,
      passkey,
      question: Boolean(questionRow),
      email: Boolean(emailRow),
      emailAddress: emailTarget?.email ?? "",
      questionText,
    },
  };
}

/* --------------------------- E-mail 2FA factor --------------------------- */

export async function enableEmailFactor(
  slug: string,
  subjectType: SubjectType,
): Promise<ActionResult<{ email: string }>> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  if (!smtpConfigured() || !mailVerificationEnabled()) {
    return { ok: false, message: t("x.e-posta-ile-2fa-icin-smtp-yaplandrlms-olmaldr") };
  }
  const target = await subjectEmail(subjectType, subject.id);
  if (!target) return { ok: false, message: t("x.hesabnza-bagl-bir-e-posta-adresi-yok-once-e-posta-ekleyi") };

  await saveFactor(subjectType, subject.id, "email", encryptData(JSON.stringify({ email: target.email })));
  await logAudit({
    action: "security.email_2fa.enabled",
    entity: "security_factor",
    entityId: `${subjectType}:${subject.id}`,
    storeSlug: target.storeSlug || null,
    summaryKey: "x.e-posta-ile-2fa-acld",
    metadata: { email: target.email },
  });
  refresh(slug || undefined);
  return { ok: true, message: t("x.e-posta-ile-2fa-acld-email", { email: target.email }), data: { email: target.email } };
}

/** Sends a fresh 6-digit code to the pending subject's mailbox. */
export async function sendLoginEmailCode(): Promise<ActionResult<{ expiresInMinutes: number }>> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: t("x.dogrulama-oturumu-suresi-doldu-yeniden-giris-yapn") };
  const gate = hitRateLimit(`2fa-mail:${pending.t}:${pending.id}`, 4, 300_000);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-kod-istegi-seconds-saniye-sonra-deneyin", { seconds: gate.retryInSeconds }) };
  }
  const row = await factorRow(pending.t, pending.id, "email");
  if (!row) return { ok: false, message: t("x.bu-hesapta-e-posta-ile-2fa-ack-degil") };
  const target = await subjectEmail(pending.t, pending.id);
  if (!target) return { ok: false, message: t("x.hesabnza-bagl-bir-e-posta-adresi-bulunamad") };

  const storeRows = target.storeSlug
    ? await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, target.storeSlug)).limit(1)
    : [];
  const challenge = await createVerification({
    storeId: storeRows[0]?.id ?? 0,
    storeSlug: target.storeSlug || "super-admin",
    storeName: target.storeName,
    email: target.email,
    username: target.name,
    purpose: "totp",
    subjectType: pending.t,
    subjectId: pending.id,
    locale: "tr",
  });
  return {
    ok: true,
    message: t("x.kod-email-adresine-gonderildi", { email: target.email }),
    data: { expiresInMinutes: 15 },
    verificationId: challenge.id,
  };
}

export async function beginTotpSetup(
  slug: string,
  subjectType: SubjectType,
): Promise<ActionResult<{ secret: string; uri: string; qr: string }>> {
  const { t } = await getTranslator();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  const secret = authenticator.generateSecret(16);
  const uri = authenticator.keyuri(subject.username, brand.name, secret);
  const qr = await QRCode.toDataURL(uri, { width: 220, margin: 1, errorCorrectionLevel: "M" });
  return { ok: true, data: { secret, uri, qr } };
}

export async function confirmTotpSetup(
  slug: string,
  subjectType: SubjectType,
  secret: string,
  code: string,
): Promise<ActionResult> {
  const { t } = await getTranslator();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  const normalized = secret.replace(/\s+/g, "").toUpperCase();
  if (!normalized || normalized.length < 8) {
    return { ok: false, message: t("x.gecersiz-secret-anahtar") };
  }
  if (!/^[0-9]{6}$/.test(code.trim())) {
    return { ok: false, message: t("x.6-haneli-dogrulama-kodunu-girin") };
  }
  if (!authenticator.check(code.trim(), normalized)) {
    return { ok: false, message: t("x.kod-dogrulanamad-uygulamanzdaki-kodu-tekrar-deneyin") };
  }
  await saveFactor(subjectType, subject.id, "totp", encryptData(normalized));
  refresh(slug || undefined);
  return { ok: true, message: "2FA (TOTP) aktif edildi." };
}

export async function beginPasskeyRegistration(
  slug: string,
  subjectType: SubjectType,
): Promise<ActionResult<{ options: Record<string, unknown>; tokenId: string }>> {
  const { t } = await getTranslator();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  const { challenge, tokenId } = issueChallenge("register");
  const options = {
    rp: { name: brand.name, id: "" },
    user: {
      id: Buffer.from(new TextEncoder().encode(`kr:${subjectType}:${subject.id}`)).toString("base64url"),
      name: subject.username,
      displayName: subject.username,
    },
    challenge,
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
  };
  return { ok: true, data: { options, tokenId } };
}

export async function savePasskeyRegistration(
  slug: string,
  subjectType: SubjectType,
  tokenId: string,
  challenge: string,
  credentialJson: string,
): Promise<ActionResult> {
  const { t } = await getTranslator();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  if (!consumeChallenge(tokenId, challenge)) {
    return { ok: false, message: t("x.kurulum-oturumu-suresi-doldu-tekrar-deneyin") };
  }
  try {
    const credential = JSON.parse(credentialJson) as {
      id: string;
      rawId: string;
      type: string;
      response: { clientDataJSON: string; authenticatorAttachment?: string; transports?: string[] };
      publicKey: StoredPasskey["publicKey"];
    };
    const clientData = JSON.parse(Buffer.from(credential.response.clientDataJSON, "base64url").toString("utf8")) as {
      type: string;
      challenge: string;
    };
    if (clientData.type !== "webauthn.create" || clientData.challenge !== challenge) {
      return { ok: false, message: t("x.kurulum-dogrulanamad-tekrar-deneyin") };
    }
    const stored: StoredPasskey = {
      id: credential.id,
      rawId: credential.rawId,
      type: credential.type,
      response: {
        clientDataJSON: credential.response.clientDataJSON,
        authenticatorAttachment: credential.response.authenticatorAttachment,
        transports: credential.response.transports,
      },
      publicKey: credential.publicKey,
    };
    await saveFactor(subjectType, subject.id, "passkey", encryptData(JSON.stringify(stored)));
    refresh(slug || undefined);
    return { ok: true, message: t("x.passkey-kaydedildi-2") };
  } catch {
    return { ok: false, message: t("x.passkey-verisi-cozumlenemedi-tekrar-deneyin") };
  }
}

export async function setSecurityQuestion(
  slug: string,
  subjectType: SubjectType,
  question: string,
  answer: string,
  confirmAnswer: string,
): Promise<ActionResult> {
  const { t } = await getTranslator();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  const cleanQuestion = question.trim();
  if (cleanQuestion.length < 5) {
    return { ok: false, message: t("x.guvenlik-sorusu-en-az-5-karakter-olmaldr") };
  }
  const cleanAnswer = answer.trim().toLowerCase();
  if (cleanAnswer.length < 3) {
    return { ok: false, message: t("x.cevap-en-az-3-karakter-olmaldr") };
  }
  if (cleanAnswer !== confirmAnswer.trim().toLowerCase()) {
    return { ok: false, message: t("x.cevap-onaylar-eslesmiyor-ikisi-de-ayn-olmal") };
  }
  const data = JSON.stringify({ question: cleanQuestion, answerHash: hashPassword(cleanAnswer) });
  await saveFactor(subjectType, subject.id, "question", data);
  refresh(slug || undefined);
  return { ok: true, message: t("x.guvenlik-sorusu-kaydedildi-2") };
}

export async function removeFactor(slug: string, subjectType: SubjectType, kind: Kind): Promise<ActionResult> {
  const { t } = await getTranslator();
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: t("x.oturum-bulunamad") };
  if (!KINDS.includes(kind)) return { ok: false, message: t("x.gecersiz-yontem") };
  const row = await factorRow(subjectType, subject.id, kind);
  if (!row) return { ok: false, message: t("x.kaytl-yontem-bulunamad") };
  await db
    .delete(securityFactors)
    .where(
      and(
        eq(securityFactors.subjectType, subjectType),
        eq(securityFactors.subjectId, subject.id),
        eq(securityFactors.kind, kind),
      ),
    );
  await logAudit({
    action: `security.factor.removed.${kind}`,
    entity: "security_factor",
    entityId: `${subjectType}:${subject.id}`,
    summaryKey: "x.kind-guvenlik-yontemi-kaldrld",
    summaryParams: { kind },
  });
  const target = await subjectEmail(subjectType, subject.id);
  if (target) {
    const template = securityTemplate({
      storeName: target.storeName,
      username: target.name,
      what: t("x.guvenlik-yontemi-kaldrld"),
      detail: kind,
      at: new Date(),
    });
    await deliver({ to: target.email, template, kind: "security" });
  }
  refresh(slug || undefined);
  return { ok: true, message: t("x.guvenlik-yontemi-kaldrld-2") };
}

/* ------------------------------ Login challenge ------------------------------ */

function finalizeSession(subject: PendingSubject): { redirectTo: string; apply: () => Promise<void> } {
  if (subject.t === "super") {
    return {
      redirectTo: "/super-admin",
      apply: async () => {
        await clearSessionCookie(STORE_COOKIE);
        await setSessionCookie(SUPER_COOKIE, { kind: "super", id: 1, username: subject.username });
      },
    };
  }
  if (subject.t === "store") {
    return {
      redirectTo: `/${subject.slug}/admin`,
      apply: async () => {
        await clearSessionCookie(SUPER_COOKIE);
        await setSessionCookie(STORE_COOKIE, {
          kind: "store",
          storeId: subject.storeId,
          adminId: subject.id,
          username: subject.username,
          slug: subject.slug,
        });
      },
    };
  }
  return {
    redirectTo: `/${subject.slug}/kutuphane`,
    apply: async () => {
      await setSessionCookie(CUSTOMER_COOKIE, {
        kind: "customer",
        storeId: subject.storeId,
        customerId: subject.id,
        username: subject.username,
      });
      revalidatePath(`/${subject.slug}`, "layout");
    },
  };
}

export async function verifyTwoFactorLogin(
  method: "totp" | "passkey" | "question" | "email",
  payload: { code?: string; answer?: string; assertion?: string; verificationId?: number },
): Promise<ActionResult> {
  const { t } = await getTranslator();
  await ensureDatabase();
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: t("x.dogrulama-oturumu-suresi-doldu-yeniden-giris-yapn") };

  const gate = hitRateLimit(`2fa:${pending.t}:${pending.id}`, 5, 60_000);
  if (!gate.allowed) {
    return { ok: false, message: t("x.cok-fazla-dogrulama-denemesi-seconds-saniye-bekleyin", { seconds: gate.retryInSeconds }) };
  }

  let passed = false;
  if (method === "totp") {
    const row = await factorRow(pending.t, pending.id, "totp");
    const secret = row ? decryptData(row.data) : "";
    passed = Boolean(secret && payload.code && /^[0-9]{6}$/.test(payload.code) && authenticator.check(payload.code, secret));
  } else if (method === "question") {
    const row = await factorRow(pending.t, pending.id, "question");
    if (row && payload.answer) {
      const stored = JSON.parse(row.data) as { answerHash: string };
      passed = verifyPassword(payload.answer.trim().toLowerCase(), stored.answerHash);
    }
  } else if (method === "email") {
    const row = await factorRow(pending.t, pending.id, "email");
    if (row && payload.code) {
      const outcome = await consumeVerification({ id: payload.verificationId ?? null }, payload.code);
      passed = outcome.ok && outcome.purpose === "totp";
    }
  } else if (method === "passkey") {
    const row = await factorRow(pending.t, pending.id, "passkey");
    if (row && payload.assertion) {
      try {
        const assertion = JSON.parse(payload.assertion) as {
          credential: { id: string; rawId: string };
          response: { clientDataJSON: string; authData: string; signature: string };
        };
        const stored = JSON.parse(decryptData(row.data)) as StoredPasskey;
        if (stored.id === assertion.credential.id) {
          const clientData = JSON.parse(Buffer.from(assertion.response.clientDataJSON, "base64url").toString("utf8")) as {
            type: string;
          };
          passed =
            clientData.type === "webauthn.get" &&
            (await verifyAssertion(stored, assertion.response.clientDataJSON, assertion.response.authData, assertion.response.signature));
        }
      } catch {
        passed = false;
      }
    }
  }

  if (!passed) {
    return { ok: false, message: t("x.dogrulama-basarsz-yontemi-kontrol-edip-tekrar-deneyin") };
  }
  recordSuccess(`2fa:${pending.t}:${pending.id}`);
  const result = finalizeSession(pending);
  await result.apply();
  await clearPendingSubject();
  return { ok: true, redirectTo: result.redirectTo, message: t("x.dogrulama-basarl-2") };
}

export async function beginPasskeyLogin(): Promise<ActionResult<{ options: Record<string, unknown>; tokenId: string }>> {
  const { t } = await getTranslator();
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: t("x.dogrulama-oturumu-suresi-doldu-yeniden-giris-yapn") };
  const row = await factorRow(pending.t, pending.id, "passkey");
  if (!row) return { ok: false, message: t("x.bu-hesapta-passkey-kaytl-degil") };
  const stored = JSON.parse(decryptData(row.data)) as StoredPasskey;
  const { challenge, tokenId } = issueChallenge("login");
  const options = {
    challenge,
    rpId: "",
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials: [{ id: stored.rawId, type: "public-key" }],
  };
  return { ok: true, data: { options, tokenId } };
}

export async function verifyPendingFactors(): Promise<
  ActionResult<{ methods: { totp: boolean; passkey: boolean; question: boolean; email: boolean } }>
> {
  const { t } = await getTranslator();
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: t("x.dogrulama-oturumu-suresi-doldu") };
  const totp = !!(await factorRow(pending.t, pending.id, "totp"));
  const passkey = !!(await factorRow(pending.t, pending.id, "passkey"));
  const question = !!(await factorRow(pending.t, pending.id, "question"));
  const email = !!(await factorRow(pending.t, pending.id, "email"));
  return { ok: true, data: { methods: { totp, passkey, question, email } } };
}

