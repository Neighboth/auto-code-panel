"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Fingerprint, KeyRound, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { beginPasskeyLogin, verifyTwoFactorLogin } from "@/app/actions/security";
import { Field } from "@/components/ui";

type Methods = { totp: boolean; passkey: boolean; question: boolean };

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

export function TwoFactorPrompt({
  methods,
  redirectTo,
  slug,
  basePath,
  onCancel,
}: {
  methods: Methods;
  redirectTo: string;
  slug?: string;
  basePath?: string;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"totp" | "passkey" | "question">(
    methods.totp ? "totp" : methods.passkey ? "passkey" : "question",
  );
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState("");

  async function finish(result: { ok: boolean; message?: string; redirectTo?: string }) {
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Doğrulama başarısız.");
      return;
    }
    toast.success(result.message ?? "Doğrulama başarılı");
    let target = result.redirectTo ?? redirectTo;
    if (slug && basePath !== undefined) {
      const prefix = `/${slug}`;
      if (target === prefix) target = basePath || "/";
      else if (target.startsWith(`${prefix}/`)) target = `${basePath}${target.slice(prefix.length)}`;
    }
    window.location.assign(target);
  }

  async function submitCode() {
    if (code.length !== 6) return;
    setPending(true);
    await finish(await verifyTwoFactorLogin("totp", { code }));
  }

  async function submitQuestion() {
    if (!answer.trim()) return;
    setPending(true);
    await finish(await verifyTwoFactorLogin("question", { answer }));
  }

  async function usePasskey() {
    setPending(true);
    const begin = await beginPasskeyLogin();
    if (!begin.ok || !begin.data) {
      setPending(false);
      toast.error(begin.message ?? "Passkey başlatılamadı.");
      return;
    }
    const options = begin.data.options as {
      challenge: string;
      allowCredentials: { id: string; type: string }[];
      [key: string]: unknown;
    };
    try {
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: b64urlToBuf(options.challenge),
        timeout: 60_000,
        userVerification: "preferred",
        allowCredentials: options.allowCredentials.map((cred) => ({
          id: b64urlToBuf(cred.id),
          type: cred.type as PublicKeyCredentialType,
        })),
        rpId: (options.rpId as string | undefined) || undefined,
      };
      const assertion = (await navigator.credentials.get({ publicKey: publicKeyOptions })) as
        | PublicKeyCredential
        | null;
      if (!assertion) {
        setPending(false);
        toast.error("Passkey doğrulanamadı.");
        return;
      }
      const response = assertion.response as unknown as {
        clientDataJSON: ArrayBuffer;
        authData: ArrayBuffer;
        signature: ArrayBuffer;
      };
      const payload = {
        credential: { id: assertion.id, rawId: bufToB64url(assertion.rawId) },
        response: {
          clientDataJSON: bufToB64url(response.clientDataJSON),
          authData: bufToB64url(response.authData),
          signature: bufToB64url(response.signature),
        },
      };
      await finish(await verifyTwoFactorLogin("passkey", { assertion: JSON.stringify(payload) }));
    } catch {
      setPending(false);
      toast.error("Passkey doğrulaması sırasında hata oluştu.");
    }
  }

  const tabs = [
    { id: "totp" as const, label: "2FA Kodu", icon: Smartphone, enabled: methods.totp },
    { id: "passkey" as const, label: "Passkey", icon: Fingerprint, enabled: methods.passkey },
    { id: "question" as const, label: "Güvenlik Sorusu", icon: Lock, enabled: methods.question },
  ].filter((item) => item.enabled);

  return (
    <div
      className="mt-4 rounded-xl border p-4"
      style={{ borderColor: "#bfdbfe", background: "color-mix(in srgb, #3b82f6 5%, transparent)" }}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} />
        <p className="text-[13px] font-semibold">İki aşamalı doğrulama</p>
      </div>
      <p className="mt-1 text-[11.5px] muted">
        Hesabınız ikinci faktör koruması altında. Devam etmek için aşağıdaki yöntemlerden birini
        kullanın.
      </p>

      <div className="mt-3 flex gap-1 rounded-lg border p-1 hairline" style={{ background: "var(--bg)" }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition"
            style={{
              background: tab === item.id ? "var(--bg-elevated)" : "transparent",
              boxShadow: tab === item.id ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            <item.icon size={12} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === "totp" && methods.totp ? (
          <div className="space-y-2">
            <Field label="Uygulamanızdaki 6 haneli kod">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input mono text-center text-[16px] tracking-[0.35em]"
                inputMode="numeric"
                placeholder="000000"
                autoFocus
              />
            </Field>
            <button type="button" className="btn btn-primary w-full" onClick={submitCode} disabled={pending || code.length !== 6}>
              {pending ? "Doğrulanıyor..." : "Kodu doğrula"}
            </button>
          </div>
        ) : null}

        {tab === "passkey" && methods.passkey ? (
          <div className="space-y-2">
            <p className="text-[11.5px] muted">
              Parmak izi, Face ID veya cihaz PIN&apos;inizle doğrulayın.
            </p>
            <button type="button" className="btn btn-primary w-full" onClick={usePasskey} disabled={pending}>
              {pending ? "Doğrulanıyor..." : "Passkey ile doğrula"}
            </button>
          </div>
        ) : null}

        {tab === "question" && methods.question ? (
          <div className="space-y-2">
            <Field label="Güvenlik sorunuzun cevabı">
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                className="input"
                placeholder="Cevabınızı girin"
                autoFocus
              />
            </Field>
            <button type="button" className="btn btn-primary w-full" onClick={submitQuestion} disabled={pending || !answer.trim()}>
              {pending ? "Doğrulanıyor..." : "Cevabı doğrula"}
            </button>
          </div>
        ) : null}
      </div>

      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm mt-3">
        Girişten vazgeç
      </button>
      <p className="mt-2 flex items-center gap-1 text-[10.5px] muted">
        <KeyRound size={10} />
        Doğrulama anahtarınız hiçbir tarayıcıya gönderilmez, kodlar sunucuda üretilir.
      </p>
    </div>
  );
}
