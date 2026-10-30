"use client";
import { useT } from "@/components/i18n-provider";

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
  const t = useT();
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
      toast.error(result.message ?? t("x.totp-baslatlamad"));
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
      toast.error(result.message ?? t("x.dogrulanamad"));
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
      toast.error(result.message ?? t("x.passkey-baslatlamad"));
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
        toast.error(t("x.passkey-olusturulamad"));
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
        toast.error(save.message ?? t("x.passkey-kaydedilemedi"));
        return;
      }
      toast.success(save.message ?? t("x.passkey-kaydedildi"));
      await load();
    } catch {
      setPending(false);
      toast.error(t("x.passkey-kurulumu-srasnda-hata-olustu"));
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await setSecurityQuestion(slug, subjectType, question, answer, answerConfirm);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.kaydedilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.guvenlik-sorusu-kaydedildi"));
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
      toast.error(result.message ?? t("x.etkinlestirilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.e-posta-2fa-acld"));
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
      toast.error(result.message ?? t("x.kaldrlamad-2"));
      return;
    }
    toast.success(result.message ?? t("x.kaldrld"));
    await load();
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} />
        <h2 className="text-[14px] font-semibold">{" "}{t("x.hesap-guvenligi-2fa")}</h2>
      </div>
      <p className="mt-1 text-[11.5px] muted">{t("x.totp-uygulamas-passkey-veya-guvenlik-sorusu-en-az-biri-e")}</p>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone size={15} />
              <p className="text-[12.5px] font-medium">TOTP (Google Authenticator)</p>
            </div>
            {state.totp ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("totp")} disabled={pending}>{t("x.kaldr")}</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={startTotp} disabled={pending}>{t("x.etkinlestir")}</button>
            )}
          </div>
          {totpSetup ? (
            <form onSubmit={confirmTotp} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              {totpSetup.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    loading="lazy"
                    decoding="async" src={totpSetup.qr} alt="2FA QR kodu" className="h-28 w-28 rounded-md border hairline" />
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
                  placeholder={t("x.6-haneli-kod")}
                  className="input mono text-center text-[15px] tracking-[0.35em]"
                  inputMode="numeric"
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm flex-1" disabled={pending || totpCode.length !== 6}>
                    {pending ? t("x.dogrulanyor") : t("x.dogrula-ve-kaydet")}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTotpSetup(null)}>{t("x.vazgec")}</button>
                </div>
              </div>
            </form>
          ) : null}
        </div>

        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail size={15} />
              <p className="text-[12.5px] font-medium">{t("x.e-posta-ile-2fa")}</p>
            </div>
            {state.email ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("email")} disabled={pending}>{t("x.kaldr")}</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={toggleEmail} disabled={pending}>{t("x.etkinlestir")}</button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] muted">
            {t("x.her-giriste-hesabnza-bagl-e-posta-adresine-6-haneli-kod-")}
            {state.emailAddress ? ` (${state.emailAddress})` : t("x.hesabnza-e-posta-eklemeniz-gerekir")}
          </p>
          <p className="mt-1 text-[10.5px] muted">{t("x.not-e-posta-ile-2fa-sunucuda-smtp-yaplandrldgnda-calsr")}</p>
        </div>

        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound size={15} />
              <p className="text-[12.5px] font-medium">Passkey (WebAuthn)</p>
            </div>
            {state.passkey ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("passkey")} disabled={pending}>{t("x.kaldr")}</button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={registerPasskey} disabled={pending}>
                {pending ? "Kaydediliyor..." : "Kaydet"}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] muted">{t("x.parmak-izi-face-id-veya-pin-ile-parola-gerektirmeyen-gir")}</p>
        </div>

        <div className="rounded-lg border p-3.5 hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock size={15} />
              <p className="text-[12.5px] font-medium">{" "}{t("x.guvenlik-sorusu")}</p>
            </div>
            {state.question ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => remove("question")} disabled={pending}>{t("x.kaldr")}</button>
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
            <Field label={state.question ? t("x.yeni-guvenlik-sorusu") : t("x.guvenlik-sorusu")} className="sm:col-span-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="input"
                required
                minLength={5}
                placeholder={t("x.orn-ilk-oyun-karakterinizin-ad-neydi")}
              />
            </Field>
            <Field label="Cevap">
              <input value={answer} onChange={(event) => setAnswer(event.target.value)} className="input" required minLength={3} />
            </Field>
            <Field label={t("x.cevap-onay")}>
              <input
                value={answerConfirm}
                onChange={(event) => setAnswerConfirm(event.target.value)}
                className="input"
                required
                minLength={3}
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-sm sm:col-span-2" disabled={pending}>
              {pending ? "Kaydediliyor..." : t("x.guvenlik-sorusunu-kaydet")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
