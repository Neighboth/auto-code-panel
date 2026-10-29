"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { KeyRound, Lock, Mail, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import {
  beginPasskeyRegistration,
  beginTotpSetup,
  confirmTotpSetup,
  enableEmailFactor,
  listFactors,
  removeFactor,
  savePasskeyRegistration,
  setSecurityQuestion,
} from "@/app/actions/security";
import { Field } from "@/components/ui";

type SubjectType = "super" | "store" | "customer";
type FactorState = {
  totp: boolean;
  passkey: boolean;
  question: boolean;
  email: boolean;
  emailAddress: string;
  questionText: string;
};

function b64urlToBuf(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufToB64url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function FactorSettings({
  slug,
  subjectType,
  rpName,
}: {
  slug: string;
  subjectType: SubjectType;
  rpName: string;
}) {
  const [state, setState] = useState<FactorState>({
    totp: false,
    passkey: false,
    question: false,
    email: false,
    emailAddress: "",
    questionText: "",
  });
  const [pending, setPending] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerConfirm, setAnswerConfirm] = useState("");
  const [confirmKind, setConfirmKind] = useState<"totp" | "passkey" | "question" | "email" | null>(null);

  const load = useCallback(async () => {
    const result = await listFactors(slug, subjectType);
    if (result.ok && result.data) setState(result.data);
  }, [slug, subjectType]);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await listFactors(slug, subjectType);
      if (active && result.ok && result.data) setState(result.data);
    })();
    return () => {
      active = false;
    };
  }, [slug, subjectType]);

  async function startTotp() {
    setPending(true);
    const result = await beginTotpSetup(slug, subjectType);
    setPending(false);
    if (!result.ok || !result.data) {
      toast.error(result.message ?? "TOTP başlatılamadı.");
      return;
    }
    setTotpSetup({ secret: result.data.secret, qr: result.data.qr });
    setTotpCode("");
  }

  async function confirmTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totpSetup) return;
    setPending(true);
    const result = await confirmTotpSetup(slug, subjectType, totpSetup.secret, totpCode);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Doğrulanamadı.");
      return;
    }
    toast.success(result.message ?? "2FA aktif edildi");
    setTotpSetup(null);
    setTotpCode("");
    await load();
  }

  async function registerPasskey() {
    setPending(true);
    const result = await beginPasskeyRegistration(slug, subjectType);
    if (!result.ok || !result.data) {
      setPending(false);
      toast.error(result.message ?? "Passkey başlatılamadı.");
      return;
    }
    const options = result.data.options as {
      challenge: string;
      user: { id: string; name: string; displayName: string };
      [key: string]: unknown;
    };
    try {
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        rp: { name: rpName },
        user: {
          id: b64urlToBuf(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        challenge: b64urlToBuf(options.challenge),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 60_000,
        attestation: "none",
        authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
      };
      const credential = (await navigator.credentials.create({ publicKey: publicKeyOptions })) as
        | (PublicKeyCredential & { publicKey?: unknown })
        | null;
      if (!credential) {
        setPending(false);
        toast.error("Passkey oluşturulamadı.");
        return;
      }
      const payload = {
        id: credential.id,
        rawId: bufToB64url(credential.rawId),
        type: "public-key",
        response: { clientDataJSON: bufToB64url(credential.response.clientDataJSON) },
        publicKey: (credential as { publicKey?: unknown }).publicKey,
      };
      const save = await savePasskeyRegistration(
        slug,
        subjectType,
        result.data.tokenId,
        options.challenge,
        JSON.stringify(payload),
      );
      setPending(false);
      if (!save.ok) {
        toast.error(save.message ?? "Passkey kaydedilemedi.");
        return;
      }
      toast.success(save.message ?? "Passkey kaydedildi");
      await load();
    } catch {
      setPending(false);
      toast.error("Passkey kurulumu sırasında hata oluştu.");
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await setSecurityQuestion(slug, subjectType, question, answer, answerConfirm);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Kaydedilemedi.");
      return;
    }
    toast.success(result.message ?? "Güvenlik sorusu kaydedildi");
    setQuestion("");
    setAnswer("");
    setAnswerConfirm("");
    await load();
  }

  async function toggleEmail() {
    setPending(true);
    const result = await enableEmailFactor(slug, subjectType);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Etkinleştirilemedi.");
      return;
    }
    toast.success(result.message ?? "E-posta 2FA açıldı");
    await load();
  }

  async function remove(kind: "totp" | "passkey" | "question" | "email") {
    if (confirmKind !== kind) {
      setConfirmKind(kind);
      return;
    }
    setConfirmKind(null);
    setPending(true);
    const result = await removeFactor(slug, subjectType, kind);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Kaldırılamadı.");
      return;
    }
    toast.success(result.message ?? "Kaldırıldı");
    await load();
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} />
        <h2 className="text-[14px] font-semibold">Hesap güvenliği (2FA)</h2>
      </div>
      <p className="mt-1 text-[11.5px] muted">
        TOTP uygulaması, Passkey veya güvenlik sorusu. En az biri etkin olduğunda girişte ikinci
        doğrulama adımı istenir.
      </p>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone size={15} />
              <p className="text-[12.5px] font-medium">TOTP (Google Authenticator)</p>
            </div>
            {state.totp ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("totp")} disabled={pending}>
                Kaldır
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={startTotp} disabled={pending}>
                Etkinleştir
              </button>
            )}
          </div>
          {totpSetup ? (
            <form onSubmit={confirmTotp} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              {totpSetup.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={totpSetup.qr} alt="2FA QR kodu" className="h-28 w-28 rounded-md border hairline" />
              ) : (
                <span className="flex h-28 w-28 items-center justify-center rounded-md border hairline">
                  <QrCode size={40} className="opacity-20" />
                </span>
              )}
              <div className="flex-1 space-y-2">
                <p className="text-[11.5px] muted">
                  QR&apos;i okutun veya secret&apos;i uygulamaya elle girin:
                </p>
                <code
                  className="mono block w-full break-all rounded-md border px-2 py-1.5 text-[11px] hairline"
                  style={{ background: "var(--bg)" }}
                >
                  {totpSetup.secret}
                </code>
                <input
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 haneli kod"
                  className="input mono text-center text-[15px] tracking-[0.35em]"
                  inputMode="numeric"
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm flex-1" disabled={pending || totpCode.length !== 6}>
                    {pending ? "Doğrulanıyor..." : "Doğrula ve kaydet"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTotpSetup(null)}>
                    Vazgeç
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>

        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail size={15} />
              <p className="text-[12.5px] font-medium">E-posta ile 2FA</p>
            </div>
            {state.email ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("email")} disabled={pending}>
                Kaldır
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={toggleEmail} disabled={pending}>
                Etkinleştir
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] muted">
            Her girişte hesabınıza bağlı e-posta adresine 6 haneli kod gönderilir.
            {state.emailAddress ? ` (${state.emailAddress})` : " Hesabınıza e-posta eklemeniz gerekir."}
          </p>
          <p className="mt-1 text-[10.5px] muted">
            Not: e-posta ile 2FA, sunucuda SMTP yapılandırıldığında çalışır.
          </p>
        </div>

        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound size={15} />
              <p className="text-[12.5px] font-medium">Passkey (WebAuthn)</p>
            </div>
            {state.passkey ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("passkey")} disabled={pending}>
                Kaldır
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={registerPasskey} disabled={pending}>
                {pending ? "Kaydediliyor..." : "Kaydet"}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] muted">
            Parmak izi, Face ID veya PIN ile parola gerektirmeyen giriş doğrulaması.
          </p>
        </div>

        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock size={15} />
              <p className="text-[12.5px] font-medium">Güvenlik sorusu</p>
            </div>
            {state.question ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("question")} disabled={pending}>
                Kaldır
              </button>
            ) : null}
          </div>
          {state.question && state.questionText ? (
            <p className="mt-1.5 text-[11.5px] muted">
              Aktif soru:{" "}
              <span className="font-medium" style={{ color: "var(--fg)" }}>
                {state.questionText}
              </span>
            </p>
          ) : null}
          <form onSubmit={submitQuestion} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={state.question ? "Yeni güvenlik sorusu" : "Güvenlik sorusu"} className="sm:col-span-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="input"
                required
                minLength={5}
                placeholder="Örn. İlk oyun karakterinizin adı neydi?"
              />
            </Field>
            <Field label="Cevap">
              <input value={answer} onChange={(event) => setAnswer(event.target.value)} className="input" required minLength={3} />
            </Field>
            <Field label="Cevap onayı">
              <input
                value={answerConfirm}
                onChange={(event) => setAnswerConfirm(event.target.value)}
                className="input"
                required
                minLength={3}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-sm sm:col-span-2" disabled={pending}>
              {pending ? "Kaydediliyor..." : "Güvenlik sorusunu kaydet"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
