"use client";
import { useT } from "@/components/i18n-provider";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, KeyRound, Loader2, Lock, ShieldAlert } from "lucide-react";
import { previewCode, redeemCode } from "@/app/actions/storefront";
import { CredentialsModal } from "@/components/store/credentials-modal";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import type { CodePreview, RedeemResult } from "@/lib/types";

type Step = "entry" | "choices" | "auth" | "confirm" | "result";

export function RedeemFlow({
  slug,
  basePath,
  initialCode,
  customerName,
}: {
  slug: string;
  basePath: string;
  initialCode: string;
  customerName: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [codeInput, setCodeInput] = useState(initialCode);
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [step, setStep] = useState<Step>("entry");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestWarning, setGuestWarning] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [loggedIn, setLoggedIn] = useState(Boolean(customerName));
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!initialCode) return;
    void loadPreview(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPreview(raw: string) {
    const value = raw.trim().toUpperCase();
    if (!value) {
      setError(t("x.lutfen-bir-kod-girin"));
      return;
    }
    setPending(true);
    setError(null);
    const response = await previewCode(slug, value);
    setPending(false);
    if (!response.ok || !response.data) {
      setError(response.message ?? t("x.kod-dogrulanamad"));
      setPreview(null);
      setStep("entry");
      return;
    }
    setPreview(response.data);
    setSelected([]);
    if (response.data.type === "choice") {
      setStep("choices");
    } else if (loggedIn && !response.data.requiresAuth) {
      setStep("confirm");
    } else {
      setStep("auth");
    }
  }

  async function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadPreview(codeInput);
  }

  function toggleGame(id: number) {
    if (!preview) return;
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= preview.choiceCount) {
        toast.error(t("x.bu-kod-icin-en-fazla-count-oyun-secebilirsiniz", { count: preview.choiceCount }));
        return current;
      }
      return [...current, id];
    });
  }

  async function commit(withCredentials: boolean) {
    if (!preview) return;
    setPending(true);
    setError(null);
    const payload = {
      slug,
      code: preview.code,
      choiceGameIds: preview.type === "choice" ? selected : undefined,
      auth:
        withCredentials && username.trim()
          ? { mode: authMode, username: username.trim(), password }
          : undefined,
    } as const;
    const response = await redeemCode(payload);
    setPending(false);
    if (!response.ok || !response.data) {
      setError(response.message ?? t("x.kod-kullanlamad"));
      return;
    }
    setResult(response.data);
    setStep("result");
    setGuestWarning(false);
    if (!response.data.guest) setLoggedIn(true);
    toast.success(response.message ?? t("x.kod-kullanld"));
    router.refresh();
  }

  function proceedFromChoices() {
    if (!preview) return;
    if (selected.length !== preview.choiceCount) {
      setError(t("x.tam-olarak-count-oyun-secmelisiniz", { count: preview.choiceCount }));
      return;
    }
    setError(null);
    if (loggedIn && !preview.requiresAuth) setStep("confirm");
    else setStep("auth");
  }

  const durationText = preview?.durationLabel ?? "";
  const stepLabels: Record<Step, string> = {
    entry: t("x.kod-girisi"),
    choices: t("x.oyun-secimi"),
    auth: "x.hesap",
    confirm: "x.onay",
    result: "x.teslimat",
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <ol className="mb-7 flex items-center gap-2 text-[11px]">
        {(["entry", "choices", "auth", "result"] as Step[]).map((item, index) => {
          const order: Step[] = ["entry", "choices", "auth", "confirm", "result"];
          const activeIndex = order.indexOf(step);
          const itemIndex = order.indexOf(item);
          const isActive = itemIndex === activeIndex || (item === "choices" && step === "confirm");
          const done = itemIndex < activeIndex;
          return (
            <li key={item} className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold hairline"
                style={{
                  background: done || isActive ? "var(--store-primary)" : "transparent",
                  color: done || isActive ? "#fff" : "var(--fg-muted)",
                }}
              >
                {done ? <Check size={11} /> : index + 1}
              </span>
              <span className={isActive ? "font-medium" : "muted"}>{stepLabels[item]}</span>
              {index < 3 ? <span className="mx-1 h-px w-5" style={{ background: "var(--border)" }} /> : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="note note-danger mb-4 text-[12.5px]">
          {error}
        </div>
      ) : null}

      {step === "entry" ? (
        <div className="card p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border hairline">
            <KeyRound size={17} />
          </span>
          <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">Redeem kodunu kullan</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed muted">{t("x.satn-aldgnz-kodu-girin-secmeli-kodlarda-oyunlarnz-kendin")}</p>
          <form onSubmit={onSubmitCode} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="KEYR-XXXXX-XXXXX"
              className="input mono flex-1 uppercase tracking-wide"
              aria-label={t("redeem.title")}
              required
            />
            <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {t("x.kodu-dogrula")}
            </button>
          </form>
          <div className="mt-5 rounded-lg border px-3.5 py-3 hairline">
            <p className="text-[11.5px] leading-relaxed muted">{t("x.kodunuz-magaza-sahibinden-aldgnz-keyr-xxxxx-xxxxx-format")}</p>
          </div>
        </div>
      ) : null}

      {step === "choices" && preview ? (
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">{t("redeem.kind")}</p>
              <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">{t("redeem.choose")}</h1>
              <p className="mt-1 text-[12.5px] muted">
                {t("x.count-oyun-hakknz-var-erisim-suresi-duration", { count: preview.choiceCount, duration: durationText })}
              </p>
            </div>
            <span className="badge badge-blue">
              {t("x.selected-total-secildi", { selected: selected.length, total: preview.choiceCount })}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {preview.selectableGames.map((game) => {
              const active = selected.includes(game.id);
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => toggleGame(game.id)}
                  className="flex items-center gap-3 rounded-xl border p-2.5 text-left transition hairline"
                  style={{
                    borderColor: active ? "var(--store-primary)" : "var(--border)",
                    background: active ? "color-mix(in srgb, var(--store-primary) 5%, transparent)" : "transparent",
                  }}
                >
                  <span className="h-12 w-20 shrink-0 overflow-hidden rounded-md" style={{ background: "var(--bg)" }}>
                    {game.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                    loading="lazy"
                    decoding="async" src={game.coverImage} alt={game.title} className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{game.title}</span>
                    <span className="mt-0.5 block text-[10.5px] muted">{t("x.dijital-teslimat")}</span>
                  </span>
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border hairline"
                    style={{ background: active ? "var(--store-primary)" : "transparent" }}
                  >
                    {active ? <Check size={12} color="#fff" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex justify-between gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => { setStep("entry"); setPreview(null); }}>{t("x.kodu-degistir")}</button>
            <button type="button" className="btn btn-primary" onClick={proceedFromChoices}>
              Devam et
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {step === "auth" && preview ? (
        <div className="card p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border hairline">
            <Lock size={16} />
          </span>
          <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em]">{t("x.teslimat-kaydetmek-icin-hesap-olustur")}</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed muted">{t("x.kutuphanenize-kaydetmek-icin-sadece-kullanc-ad-ve-sifre")}</p>

          <div className="mt-4 flex items-center gap-1 rounded-lg border p-1 hairline">
            {(["register", "login"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAuthMode(mode)}
                className="flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition"
                style={{
                  background: authMode === mode ? "var(--store-primary)" : "transparent",
                  color: authMode === mode ? "#fff" : "var(--fg-muted)",
                }}
              >
                {mode === "register" ? t("x.hesap-olustur") : t("x.giris-yap")}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={t("x.kullanc-ad")}>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="input"
                placeholder="oyuncu_adi"
                autoComplete="username"
              />
            </Field>
            <Field label={t("x.sifre")} hint="En az 6 karakter.">
              <div className="relative">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  className="input pr-14"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-medium muted"
                >
                  {showPassword ? "Gizle" : t("x.goster")}
                </button>
              </div>
            </Field>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => setGuestWarning(true)}
              className="btn btn-outline"
            >{t("x.uye-olmadan-es-gec")}</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => commit(true)}
              disabled={pending || !username.trim() || password.length < 6}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {authMode === "register" ? t("x.hesap-olustur-ve-kodu-kullan") : t("x.giris-yap-ve-kodu-kullan")}
            </button>
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed muted">{t("x.hesap-olusturmazsanz-teslimat-tek-seferlik-goruntulenir")}</p>
        </div>
      ) : null}

      {step === "confirm" && preview ? (
        <div className="card p-6">
          <h1 className="text-[21px] font-semibold tracking-[-0.02em]">{t("redeem.confirm")}</h1>
          <p className="mt-1.5 text-[12.5px] muted">{t("x.paylasml-hesap-teslimat-kod-kullanldgnda-erisim-snrsz-su")}</p>
          <div className="mt-4 divide-y rounded-lg border hairline">
            {preview.items.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div>
                  <p className="text-[12.5px] font-medium">{item.title}</p>
                  <p className="text-[10.5px] muted">{item.subtitle}</p>
                </div>
                <span className="badge">{item.kind === "game" ? "Oyun" : "Hesap"}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="badge badge-blue">{t("library.unlimited")}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setStep("entry")}>{t("x.vazgec")}</button>
              <button type="button" className="btn btn-primary" onClick={() => commit(false)} disabled={pending}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : null}
                Kodu kullan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "result" && result ? (
        <div className="space-y-4">
          <div className="card p-6">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "color-mix(in srgb, #16a34a 14%, transparent)", color: "#16a34a" }}
            >
              <Check size={18} />
            </span>
            <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">{t("redeem.result")}</h1>
            <p className="mt-1.5 text-[12.5px] muted">
              {t("x.code-kodu-kullanld", { code: result.code })} ·{" "}
              {result.expiresAt
                ? t("x.erisim-bitisi-when", { when: new Date(result.expiresAt).toLocaleString() })
                : t("x.snrsz-erisim")}
            </p>
            {result.guest ? (
              <div
                className="mt-4 flex items-start gap-2 rounded-lg border px-3.5 py-3"
              >
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                <p className="text-[12px] font-medium leading-relaxed">{t("x.dikkat-hesap-olusturmadan-devam-ettiginiz-icin-bu-sayfay")}</p>
              </div>
            ) : null}
          </div>

          {result.items.map((item, index) => (
            <div key={item.entitlementId} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b px-4 py-3 hairline">
                <div>
                  <p className="text-[13.5px] font-semibold">{item.title}</p>
                  <p className="text-[10.5px] muted">
                    {item.platformLabel} · {item.subtitle}
                  </p>
                </div>
                <span className="badge">{item.kind === "game" ? "Ürün" : "Hesap"}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
                <p className="text-[11.5px] muted">{t("x.kullanc-ad-sifre-notlar-ve-canl-kod-srayla-gosterilir")}</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setDetailIndex(index)}
                >
                  Hesap bilgilerini al
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setResult(null);
                setPreview(null);
                setSelected([]);
                setCodeInput("");
                setStep("entry");
              }}
            >
              Yeni kod kullan
            </button>
            {result.guest ? (
              <Link href={`${basePath}/kayit`} className="btn btn-primary">{t("x.hesap-olustur")}<ArrowRight size={14} />
              </Link>
            ) : (
              <Link href={`${basePath}/kutuphane`} className="btn btn-primary">{t("x.kutuphaneme-git")}<ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={guestWarning}
        onClose={() => setGuestWarning(false)}
        title={t("redeem.guestTitle")}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setGuestWarning(false)}>{t("x.hesap-olusturaym")}</button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => commit(false)}
              disabled={pending}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              Yine de devam et
            </button>
          </>
        }
      >
        <div
          className="flex items-start gap-3 rounded-lg border p-3.5"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <p className="text-[12.5px] font-medium leading-relaxed">{t("x.dikkat-hesap-olusturmadan-devam-ederseniz-bu-sayfay-kapa")}</p>
        </div>
      </Modal>

      {result && detailIndex !== null && result.items[detailIndex] ? (
        <CredentialsModal
          open
          onClose={() => setDetailIndex(null)}
          slug={slug}
          item={{
            entitlementId: result.items[detailIndex].entitlementId,
            title: result.items[detailIndex].title,
            subtitle: result.items[detailIndex].subtitle,
            platformLabel: result.items[detailIndex].platformLabel,
            guardType: result.items[detailIndex].guardType,
            username: result.items[detailIndex].username,
            email: result.items[detailIndex].email,
            password: result.items[detailIndex].password,
            mailEmail: result.items[detailIndex].mailEmail,
            mailPassword: result.items[detailIndex].mailPassword,
            notes: result.items[detailIndex].notes,
            accessToken: result.guestToken,
          }}
        />
      ) : null}
    </div>
  );
}
