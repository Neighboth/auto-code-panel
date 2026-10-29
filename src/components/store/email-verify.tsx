"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Loader2, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { resendCustomerVerification, verifyCustomerEmail } from "@/app/actions/auth";
import { Field } from "@/components/ui";

/**
 * 6-digit e-mail verification form.
 *
 * Used in two places:
 *  - inline, right after registration or a gated sign-in (`mode="inline"`)
 *  - on the magic-link page, where the code is shown once and the user can
 *    copy it / verify directly (`mode="link"` + `initialCode`)
 */
export function EmailVerifyCard({
  slug,
  email,
  verificationId,
  token,
  initialCode,
  mode = "inline",
  basePath = "",
  redirectTo,
}: {
  slug: string;
  email?: string;
  verificationId?: number | null;
  token?: string | null;
  initialCode?: string | null;
  mode?: "inline" | "link";
  basePath?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  // The magic-link page already knows the code; prefill it without an effect.
  const [code, setCode] = useState(initialCode ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(verificationId ?? null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await verifyCustomerEmail(slug, { id: currentId, token: token ?? null }, code);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Doğrulama başarısız.");
      return;
    }
    toast.success(result.message ?? "Doğrulandı");
    const target = redirectTo ?? result.data?.redirectTo ?? `${basePath}/kutuphane`;
    router.push(target);
    router.refresh();
  }

  async function copyCode() {
    if (!initialCode) return;
    try {
      await navigator.clipboard.writeText(initialCode);
      setCopied(true);
      toast.success("Kod kopyalandı");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Kopyalanamadı, kodu elle seçin.");
    }
  }

  async function resend() {
    if (!email) return;
    setResending(true);
    const result = await resendCustomerVerification(slug, email);
    setResending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Kod gönderilemedi.");
      return;
    }
    setCurrentId(result.data?.verificationId ?? null);
    toast.success(result.message ?? "Yeni kod gönderildi");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border p-3 hairline">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border hairline">
          <MailCheck size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium">
            {mode === "link" ? "Doğrulama kodunuz" : "E-postanızı doğrulayın"}
          </p>
          <p className="mt-0.5 break-all text-[11.5px] leading-relaxed muted">
            {email ? `${email} adresine 6 haneli bir kod gönderdik.` : "E-postanıza gönderilen 6 haneli kodu girin."}
          </p>
        </div>
      </div>

      {initialCode ? (
        <div className="rounded-xl border border-dashed p-4 text-center hairline">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">
            E-posta doğrulama kodu
          </p>
          <p className="mono mt-2 text-[34px] font-bold leading-none tracking-[0.28em]">{initialCode}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button type="button" onClick={copyCode} className="btn btn-outline btn-sm">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Kopyalandı" : "Kodu kopyala"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed muted">
            Kodu kopyalayıp kayıt sayfasına dönerek girebilir veya bu sayfada aşağıdaki alana yazabilirsiniz.
          </p>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-3">
        <Field label="Doğrulama kodu" htmlFor="verification-code" hint="6 haneli sayısal kod">
          <input
            id="verification-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="input mono text-center text-[20px] tracking-[0.3em]"
            required
          />
        </Field>
        {error ? <p className="note note-danger text-[12px]">{error}</p> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={pending || code.length !== 6}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          Doğrula ve giriş yap
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11.5px] hairline">
        <button
          type="button"
          onClick={resend}
          disabled={resending || !email}
          className="inline-flex items-center gap-1.5 muted disabled:opacity-50"
        >
          {resending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Kodu tekrar gönder
        </button>
        <Link href={basePath ? `${basePath}/giris` : "/"} className="muted underline underline-offset-2">
          Giriş ekranına dön
        </Link>
      </div>
    </div>
  );
}
