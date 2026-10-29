"use client";
import { useT } from "@/components/i18n-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, Fingerprint, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { getTwoFactorCode, type AccessCode } from "@/app/actions/storefront";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/markdown";
import { Modal } from "@/components/modal";
import { GUARD_OPTIONS } from "@/lib/fonts";

export type CredentialItem = {
  entitlementId: number;
  title: string;
  subtitle?: string;
  platformLabel: string;
  guardType: string;
  username: string | null;
  email: string | null;
  password: string | null;
  mailEmail: string | null;
  mailPassword: string | null;
  notes: string;
  accessToken?: string | null;
};

type Step = "credentials" | "notes" | "code";

/**
 * Ordered credential flow:
 *  1) account credentials → 2) notes (credentials leave the screen) → 3) live code
 * This matches how a shared account is used: log in, read the rules, then grab
 * the 2FA/Guard code.
 */
type CredentialsModalProps = {
  open: boolean;
  onClose: () => void;
  slug: string;
  item: CredentialItem | null;
};

/**
 * Mounts the wizard only while it is open, so every delivery starts from the
 * first step with a clean state (no reset effect needed).
 */
export function CredentialsModal(props: CredentialsModalProps) {
  if (!props.open || !props.item) return null;
  return <CredentialsWizard key={props.item.entitlementId} {...props} />;
}

function CredentialsWizard({ open, onClose, slug, item }: CredentialsModalProps) {
  const t = useT();
  const [step, setStep] = useState<Step>("credentials");
  const [code, setCode] = useState<AccessCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  const loadCode = useCallback(
    async (autoRefresh = false) => {
      if (!item) return;
      setLoading(true);
      setError(null);
      const response = await getTwoFactorCode(slug, item.entitlementId, item.accessToken ?? undefined);
      setLoading(false);
      if (!response.ok || !response.data) {
        if (!autoRefresh) setError(response.message ?? t("x.kod-uretilemedi"));
        return;
      }
      setCode(response.data);
      setSeconds(response.data.secondsRemaining);
    },
    [item, slug, t],
  );

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (step !== "code" || !code || code.kind === "email") return;
    timerRef.current = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          void loadCode(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [step, code, loadCode]);

  if (!item) return null;
  const guardLabel = t(GUARD_OPTIONS.find((option) => option.id === item.guardType)?.label ?? "x.2fa-yok");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.title}
      description={item.subtitle ? `${item.platformLabel} · ${item.subtitle}` : item.platformLabel}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] muted">
            <ShieldCheck size={12} />
            {step === "credentials" ? "1 / 3 · Hesap bilgileri" : step === "notes" ? "2 / 3 · Notlar" : "3 / 3 · Kod"}
          </div>
          <div className="flex items-center gap-2">
            {step !== "credentials" ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setStep(step === "code" ? "notes" : "credentials")}
              >
                <ArrowLeft size={12} />
                Geri
              </button>
            ) : null}
            {step === "credentials" ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep("notes")}>
                Devam et
                <ArrowRight size={12} />
              </button>
            ) : null}
            {step === "notes" ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setStep("code");
                  if (item.guardType !== "none") void loadCode();
                }}
              >
                Kodu al
                <ArrowRight size={12} />
              </button>
            ) : null}
            {step === "code" ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => loadCode()}>
                <RefreshCw size={12} />
                Yenile
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {step === "credentials" ? (
          <>
            <div className="grid gap-2.5">
              {item.username ? <Credential label={t("x.kullanc-ad-2")} value={item.username} /> : null}
              {item.email ? <Credential label="E-posta" value={item.email} /> : null}
              {item.password ? <Credential label={t("x.sifre")} value={item.password} mono /> : null}
            </div>
            <p className="note note-warn">{t("x.bu-hesap-paylasmldr-baska-kullanclar-da-ayn-hesab-kullan")}</p>
            <p className="text-[11px] muted">{t("x.devam-ettiginizde-hesap-bilgileri-ekrandan-kalkar-yerine")}</p>
          </>
        ) : null}

        {step === "notes" ? (
          <>
            {item.notes ? (
              <div className="rounded-xl border p-3.5 hairline">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">{t("x.kullanm-notlar")}</p>
                <Markdown content={item.notes} />
              </div>
            ) : (
              <p className="note">{t("library.noNotes")}</p>
            )}
            {item.mailEmail ? (
              <div className="grid gap-2.5">
                <Credential label={t("x.bagl-e-posta")} value={item.mailEmail} />
                {item.mailPassword ? (
                  <Credential label={t("x.e-posta-sifresi")} value={item.mailPassword} mono />
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 hairline">
              <Fingerprint size={14} />
              <div>
                <p className="text-[12px] font-medium">{guardLabel}</p>
                <p className="text-[10.5px] muted">{t("x.kod-sunucuda-uretilir-secret-taraycya-gonderilmez")}</p>
              </div>
            </div>
          </>
        ) : null}

        {step === "code" ? (
          <>
            {item.guardType === "none" ? (
              <p className="note note-warn">{t("x.bu-hesapta-2fa-guard-tanml-degil-kullanc-ad-ve-sifre-ile")}</p>
            ) : null}
            {error ? <p className="note note-danger">{error}</p> : null}
            <div
              className="rounded-xl border p-5 text-center hairline"
              style={{ background: "color-mix(in srgb, var(--store-accent) 5%, transparent)" }}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">
                {code?.kind === "steam" ? "Steam Guard" : code?.kind === "email" ? "E-posta kodu" : "2FA kodu"}
              </p>
              {loading && !code ? (
                <Loader2 size={22} className="mx-auto mt-3 animate-spin" />
              ) : (
                <p className="mono mt-2 text-[34px] font-semibold leading-none tracking-[0.16em]">
                  {code?.code ?? "— — — — —"}
                </p>
              )}
              {code && code.secondsRemaining > 0 ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] muted">
                  <Clock3 size={12} />
                  {t("x.seconds-saniye-icinde-yenilenecek", { seconds })}
                </p>
              ) : code?.kind === "email" ? (
                <p className="mt-3 text-[11.5px] muted">{code.detail || "En yeni mailden alındı"}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] muted">{t("x.kodu-giris-ekranndaki-dogrulama-alanna-yapstrn-sure-biti")}</p>
              {code ? <CopyButton value={code.code} /> : null}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export function Credential({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 hairline">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">{label}</p>
        <p className={`mt-0.5 truncate text-[12.5px] font-medium ${mono ? "mono" : ""}`}>{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}
