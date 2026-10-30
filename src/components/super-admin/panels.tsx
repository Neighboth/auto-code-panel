"use client";
import { useT } from "@/components/i18n-provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, Loader2, ShieldOff } from "lucide-react";
import {
  createResellerKeys,
  extendStoreLicense,
  revokeResellerKey,
  setStoreSuspension,
  updatePlatformSettings,
} from "@/app/actions/super-admin";
import { Field } from "@/components/ui";
import { Modal } from "@/components/modal";

/** Values are dictionary keys; they are translated at render time. */
const durationOptions: { label: string; days: number | null }[] = [
  { label: "x.1-hafta", days: 7 },
  { label: "x.1-ay", days: 30 },
  { label: "x.3-ay", days: 90 },
  { label: "x.6-ay", days: 180 },
  { label: "x.1-yl", days: 365 },
  { label: "x.2-yl", days: 730 },
  { label: "x.snrsz", days: null },
  /** Sentinel: the real value comes from the "custom days" input. */
  { label: "x.ozel-gun", days: -1 },
];

export function ResellerKeyGenerator({ globalRenewalUrl }: { globalRenewalUrl: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [durationIndex, setDurationIndex] = useState("1");
  const [unlimitedAccounts, setUnlimitedAccounts] = useState(false);
  const [count, setCount] = useState(1);
  /** Empty = inherit the env/platform default; anything else overrides it. */
  const [renewalUrl, setRenewalUrl] = useState("");
  const [customDays, setCustomDays] = useState(45);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const preset = durationOptions[Number(formData.get("duration"))] ?? durationOptions[0];
    const durationDays = preset.days === -1 ? Math.max(1, Math.trunc(customDays)) : preset.days;
    const maxAccountsRaw = String(formData.get("maxAccounts") ?? "").trim();
    const result = await createResellerKeys({
      durationDays,
      maxAccounts: unlimitedAccounts || !maxAccountsRaw ? (unlimitedAccounts ? null : 50) : Number(maxAccountsRaw),
      // Empty means "use the platform default"; the server stores null then.
      renewalUrl: renewalUrl.trim(),
      note: String(formData.get("note") ?? ""),
      count,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.kod-uretilemedi"));
      return;
    }
    setCodes(result.data?.codes ?? []);
    toast.success(result.message ?? t("x.kodlar-olusturuldu"));
    router.refresh();
  }

  async function copyAll() {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success(t("x.tum-kodlar-kopyaland"));
  }

  function download() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bayilik-kodlari-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{" "}{t("x.bayilik-kodu-uret")}</h2>
          <p className="mt-1 text-[12px] muted">{" "}{t("x.sure-hesap-limiti-ve-sure-uzatma-linki-kodla-birlikte-sa")}</p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("x.bayilik-suresi")}>
            <select
              name="duration"
              className="select"
              value={durationIndex}
              onChange={(event) => setDurationIndex(event.target.value)}
            >
              {durationOptions.map((option, index) => (
                <option key={option.label} value={index}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </Field>
          {durationOptions[Number(durationIndex)]?.days === -1 ? (
            <Field label={t("x.ozel-gun-sayisi")} hint={t("x.1-ile-3650-gun-arasi")}>
              <input
                type="number"
                min={1}
                max={3650}
                className="input"
                value={customDays}
                onChange={(event) =>
                  setCustomDays(Math.min(3650, Math.max(1, Number(event.target.value) || 1)))
                }
              />
            </Field>
          ) : null}
          <Field label={t("x.maksimum-hesap-limiti")}>
            <div className="flex items-center gap-2">
              <input
                name="maxAccounts"
                type="number"
                min={1}
                defaultValue={50}
                disabled={unlimitedAccounts}
                className="input"
                placeholder="50"
              />
              <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] muted">
                <input
                  type="checkbox"
                  checked={unlimitedAccounts}
                  onChange={(event) => setUnlimitedAccounts(event.target.checked)}
                />{t("x.snrsz")}</label>
            </div>
          </Field>
        </div>
        <Field
          label={t("x.sure-uzatma-linki")}
          hint={t("x.bos-birakirsaniz-ortam-degiskenindeki-varsayilan-link-ku")}
        >
          <input
            name="renewalUrl"
            className="input mono text-[12px]"
            value={renewalUrl}
            onChange={(event) => setRenewalUrl(event.target.value)}
            placeholder={globalRenewalUrl}
            inputMode="url"
          />
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] muted">
            <span>{t("x.varsayilan")}:</span>
            <code className="mono truncate">{globalRenewalUrl}</code>
            {renewalUrl && renewalUrl !== globalRenewalUrl ? (
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setRenewalUrl("")}
              >
                {t("x.sifirla")}
              </button>
            ) : null}
          </p>
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <Field label={t("x.not-opsiyonel")}>
            <input name="note" className="input" placeholder={t("x.orn-kampanya-bayi-paketi")} />
          </Field>
          <Field label={t("x.adet")}>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(event) => setCount(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
              className="input"
            />
          </Field>
        </div>
        {error ? (
          <p className="text-[12px]" style={{ color: "#dc2626" }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-dark w-full" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("x.kod-olustur")}
        </button>
      </form>

      {codes.length > 0 ? (
        <div className="mt-4 rounded-lg border p-3 hairline">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] muted">{" "}{t("x.uretilen-kodlar")}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={copyAll} className="btn btn-outline btn-sm">
                <Copy size={12} /> Kopyala
              </button>
              <button type="button" onClick={download} className="btn btn-outline btn-sm">
                <Download size={12} /> TXT
              </button>
            </div>
          </div>
          <pre className="mono mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md p-2 text-[11.5px] scroll-thin" style={{ background: "var(--bg)" }}>
            {codes.join("\n")}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function RevokeKeyButton({ keyId, status }: { keyId: number; status: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (status !== "available") return null;
  async function onClick() {
    setPending(true);
    const formData = new FormData();
    formData.set("id", String(keyId));
    const result = await revokeResellerKey(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.iptal-edilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.iptal-edildi"));
    router.refresh();
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} className="btn btn-ghost btn-sm">
      {pending ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
      {t("x.iptal")}
    </button>
  );
}

export function StoreActions({
  storeId,
  storeName,
  suspended,
  expiresAt,
  maxAccounts,
  renewalUrl,
}: {
  storeId: number;
  storeName: string;
  suspended: boolean;
  expiresAt: string | null;
  maxAccounts: number | null;
  renewalUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onExtend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    formData.set("storeId", String(storeId));
    const result = await extendStoreLicense(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.guncellenemedi"));
      return;
    }
    toast.success(result.message ?? t("x.guncellendi"));
    setOpen(false);
    router.refresh();
  }

  async function toggleSuspension() {
    setPending(true);
    const formData = new FormData();
    formData.set("storeId", String(storeId));
    formData.set("suspended", String(!suspended));
    const result = await setStoreSuspension(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.islem-basarsz"));
      return;
    }
    toast.success(result.message ?? t("x.guncellendi"));
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        {t("x.lisans")}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSuspension} disabled={pending}>
        {suspended ? t("x.aktiflestir") : t("x.askya-al")}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("x.store-lisans-yonetimi", { store: storeName })}
        description={t("x.eklenen-gunler-mevcut-bitis-tarihinin-uzerine-eklenir-ge")}
      >
        <form onSubmit={onExtend} className="space-y-4">
          <div className="rounded-lg border px-3 py-2 text-[12px] hairline">
            <span className="muted">{" "}{t("x.mevcut-bitis")}</span>
            <span className="font-medium">
              {expiresAt ? new Date(expiresAt).toLocaleDateString("tr-TR") : t("x.snrsz")}
            </span>
            <span className="mx-2 muted">·</span>
            <span className="muted">{t("x.hesap-limiti")}: </span>
            <span className="font-medium">{maxAccounts ?? t("x.snrsz")}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("x.eklenecek-gun")} hint={t("x.orn-30")}>
              <input name="days" type="number" min={1} className="input" placeholder="30" />
            </Field>
            <Field label={t("x.hesap-limiti")} hint={t("x.unlimited-yazarak-snrsz-yapn")}>
              <input
                name="maxAccounts"
                className="input"
                defaultValue={maxAccounts ?? "unlimited"}
                placeholder="unlimited"
              />
            </Field>
          </div>
          <Field label={t("x.bayiye-ozel-sure-uzatma-linki")}>
            <input name="renewalUrl" className="input" defaultValue={renewalUrl ?? ""} placeholder="https://..." />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t("x.vazgec")}</button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("x.kaydet")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function PlatformSettingsForm({
  renewalUrl,
  supportEmail,
  defaultPlanNote,
  envRenewalUrl,
  envSupportEmail,
}: {
  renewalUrl: string;
  supportEmail: string;
  defaultPlanNote: string;
  envRenewalUrl?: string;
  envSupportEmail?: string;
}) {
  const t = useT();
  const renewalLocked = envRenewalUrl ?? renewalUrl;
  const supportLocked = envSupportEmail ?? supportEmail;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await updatePlatformSettings(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.kaydedilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.kaydedildi"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("x.destek-e-postas")}
          hint={t("x.bu-deger-support-email-ortam-degiskeninden-okunur-paneld")}
        >
          <input
            value={supportLocked}
            readOnly
            className="input mono text-[12px] opacity-70"
            aria-readonly="true"
          />
        </Field>
        <Field label={t("x.marka-ad")} hint={t("x.brand-name-ortam-degiskeninden-okunur")}>
          <input value="BRAND_NAME" readOnly className="input mono text-[12px] opacity-70" />
        </Field>
      </div>
      <Field
        label={t("x.global-sure-uzatma-linki")}
        hint={t("x.renewal-url-ortam-degiskeninden-okunur-degistirmek-icin")}
      >
        <input
          value={renewalLocked}
          readOnly
          className="input mono text-[12px] opacity-70"
          aria-readonly="true"
        />
      </Field>
      <p className="note note-info">{t("x.sure-uzatma-linki-ve-destek-e-postas-guvenlik-geregi-yal")}<span className="mono">.env</span>{" "}
        (<span className="mono">RENEWAL_URL</span>, <span className="mono">SUPPORT_EMAIL</span>{t("x.uzerinden-yonetilir")}</p>
      <Field label={t("x.bayilere-gosterilecek-not")}>
        <textarea name="defaultPlanNote" defaultValue={defaultPlanNote} className="textarea" rows={3} />
      </Field>
      {error ? (
        <p className="text-[12px]" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("x.ayarlar-kaydet")}
        </button>
      </div>
    </form>
  );
}
