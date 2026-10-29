"use server";

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
import { decryptData, encryptData } from "@/lib/secret-crypto";
import { consumeChallenge, issueChallenge, verifyAssertion, type StoredPasskey } from "@/lib/webauthn";
import type { ActionResult } from "@/lib/types";

const KINDS = ["totp", "passkey", "question"] as const;
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
): Promise<ActionResult<{ totp: boolean; passkey: boolean; question: boolean; questionText: string }>> {
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
  const totp = !!(await factorRow(subjectType, subject.id, "totp"));
  const passkey = !!(await factorRow(subjectType, subject.id, "passkey"));
  const questionRow = await factorRow(subjectType, subject.id, "question");
  let questionText = "";
  if (questionRow) {
    try {
      questionText = (JSON.parse(questionRow.data) as { question: string }).question ?? "";
    } catch {
      questionText = "";
    }
  }
  return { ok: true, data: { totp, passkey, question: Boolean(questionRow), questionText } };
}

export async function beginTotpSetup(
  slug: string,
  subjectType: SubjectType,
): Promise<ActionResult<{ secret: string; uri: string; qr: string }>> {
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
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
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
  const normalized = secret.replace(/\s+/g, "").toUpperCase();
  if (!normalized || normalized.length < 8) {
    return { ok: false, message: "Geçersiz secret anahtarı." };
  }
  if (!/^[0-9]{6}$/.test(code.trim())) {
    return { ok: false, message: "6 haneli doğrulama kodunu girin." };
  }
  if (!authenticator.check(code.trim(), normalized)) {
    return { ok: false, message: "Kod doğrulanamadı. Uygulamanızdaki kodu tekrar deneyin." };
  }
  await saveFactor(subjectType, subject.id, "totp", encryptData(normalized));
  refresh(slug || undefined);
  return { ok: true, message: "2FA (TOTP) aktif edildi." };
}

export async function beginPasskeyRegistration(
  slug: string,
  subjectType: SubjectType,
): Promise<ActionResult<{ options: Record<string, unknown>; tokenId: string }>> {
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
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
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
  if (!consumeChallenge(tokenId, challenge)) {
    return { ok: false, message: "Kurulum oturumu süresi doldu. Tekrar deneyin." };
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
      return { ok: false, message: "Kurulum doğrulanamadı. Tekrar deneyin." };
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
    return { ok: true, message: "Passkey kaydedildi." };
  } catch {
    return { ok: false, message: "Passkey verisi çözümlenemedi. Tekrar deneyin." };
  }
}

export async function setSecurityQuestion(
  slug: string,
  subjectType: SubjectType,
  question: string,
  answer: string,
  confirmAnswer: string,
): Promise<ActionResult> {
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
  const cleanQuestion = question.trim();
  if (cleanQuestion.length < 5) {
    return { ok: false, message: "Güvenlik sorusu en az 5 karakter olmalıdır." };
  }
  const cleanAnswer = answer.trim().toLowerCase();
  if (cleanAnswer.length < 3) {
    return { ok: false, message: "Cevap en az 3 karakter olmalıdır." };
  }
  if (cleanAnswer !== confirmAnswer.trim().toLowerCase()) {
    return { ok: false, message: "Cevap onayları eşleşmiyor. İkisi de aynı olmalı." };
  }
  const data = JSON.stringify({ question: cleanQuestion, answerHash: hashPassword(cleanAnswer) });
  await saveFactor(subjectType, subject.id, "question", data);
  refresh(slug || undefined);
  return { ok: true, message: "Güvenlik sorusu kaydedildi." };
}

export async function removeFactor(slug: string, subjectType: SubjectType, kind: Kind): Promise<ActionResult> {
  const subject = await currentSubject(slug, subjectType);
  if (!subject) return { ok: false, message: "Oturum bulunamadı." };
  if (!KINDS.includes(kind)) return { ok: false, message: "Geçersiz yöntem." };
  const row = await factorRow(subjectType, subject.id, kind);
  if (!row) return { ok: false, message: "Kayıtlı yöntem bulunamadı." };
  await db
    .delete(securityFactors)
    .where(
      and(
        eq(securityFactors.subjectType, subjectType),
        eq(securityFactors.subjectId, subject.id),
        eq(securityFactors.kind, kind),
      ),
    );
  refresh(slug || undefined);
  return { ok: true, message: "Güvenlik yöntemi kaldırıldı." };
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
          storeId: subject.id,
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
        storeId: subject.id,
        customerId: subject.id,
        username: subject.username,
      });
      revalidatePath(`/${subject.slug}`, "layout");
    },
  };
}

export async function verifyTwoFactorLogin(
  method: "totp" | "passkey" | "question",
  payload: { code?: string; answer?: string; assertion?: string },
): Promise<ActionResult> {
  await ensureDatabase();
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: "Doğrulama oturumu süresi doldu. Yeniden giriş yapın." };

  const gate = hitRateLimit(`2fa:${pending.t}:${pending.id}`, 5, 60_000);
  if (!gate.allowed) {
    return { ok: false, message: `Çok fazla doğrulama denemesi. ${gate.retryInSeconds} saniye bekleyin.` };
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
    return { ok: false, message: "Doğrulama başarısız. Yöntemi kontrol edip tekrar deneyin." };
  }
  recordSuccess(`2fa:${pending.t}:${pending.id}`);
  const result = finalizeSession(pending);
  await result.apply();
  await clearPendingSubject();
  return { ok: true, redirectTo: result.redirectTo, message: "Doğrulama başarılı." };
}

export async function beginPasskeyLogin(): Promise<ActionResult<{ options: Record<string, unknown>; tokenId: string }>> {
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: "Doğrulama oturumu süresi doldu. Yeniden giriş yapın." };
  const row = await factorRow(pending.t, pending.id, "passkey");
  if (!row) return { ok: false, message: "Bu hesapta passkey kayıtlı değil." };
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

export async function verifyPendingFactors(): Promise<ActionResult<{ methods: { totp: boolean; passkey: boolean; question: boolean } }>> {
  const pending = await getPendingSubject();
  if (!pending) return { ok: false, message: "Doğrulama oturumu süresi doldu." };
  const totp = !!(await factorRow(pending.t, pending.id, "totp"));
  const passkey = !!(await factorRow(pending.t, pending.id, "passkey"));
  const question = !!(await factorRow(pending.t, pending.id, "question"));
  return { ok: true, data: { methods: { totp, passkey, question } } };
}

