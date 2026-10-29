"use client";

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

const durationOptions = [
  { label: "1 Hafta", days: 7 },
  { label: "1 Ay", days: 30 },
  { label: "3 Ay", days: 90 },
  { label: "6 Ay", days: 180 },
  { label: "1 Yıl", days: 365 },
  { label: "Sınırsız", days: null },
];

export function ResellerKeyGenerator({ globalRenewalUrl }: { globalRenewalUrl: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [durationIndex, setDurationIndex] = useState("1");
  const [unlimitedAccounts, setUnlimitedAccounts] = useState(false);
  const [count, setCount] = useState(1);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const preset = durationOptions[Number(formData.get("duration"))] ?? durationOptions[0];
    const maxAccountsRaw = String(formData.get("maxAccounts") ?? "").trim();
    const result = await createResellerKeys({
      durationDays: preset.days,
      maxAccounts: unlimitedAccounts || !maxAccountsRaw ? (unlimitedAccounts ? null : 50) : Number(maxAccountsRaw),
      renewalUrl: String(formData.get("renewalUrl") ?? globalRenewalUrl),
      note: String(formData.get("note") ?? ""),
      count,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Kod üretilemedi.");
      return;
    }
    setCodes(result.data?.codes ?? []);
    toast.success(result.message ?? "Kodlar oluşturuldu");
    router.refresh();
  }

  async function copyAll() {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Tüm kodlar kopyalandı");
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
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Bayilik kodu üret</h2>
          <p className="mt-1 text-[12px] muted">Süre, hesap limiti ve süre uzatma linki kodla birlikte saklanır.</p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bayilik Süresi">
            <select
              name="duration"
              className="select"
              value={durationIndex}
              onChange={(event) => setDurationIndex(event.target.value)}
            >
              {durationOptions.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maksimum Hesap Limiti">
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
                />
                Sınırsız
              </label>
            </div>
          </Field>
        </div>
        <Field label="Süre Uzatma İlan Linki" hint="Boş bırakılırsa sistem ayarlarındaki global link kullanılır.">
          <input name="renewalUrl" className="input" placeholder={globalRenewalUrl} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <Field label="Not (opsiyonel)">
            <input name="note" className="input" placeholder="Örn. kampanya bayi paketi" />
          </Field>
          <Field label="Adet">
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
          Kod oluştur
        </button>
      </form>

      {codes.length > 0 ? (
        <div className="mt-4 rounded-lg border p-3 hairline">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] muted">Üretilen kodlar</p>
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
      toast.error(result.message ?? "İptal edilemedi");
      return;
    }
    toast.success(result.message ?? "İptal edildi");
    router.refresh();
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} className="btn btn-ghost btn-sm">
      {pending ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
      İptal
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
      toast.error(result.message ?? "Güncellenemedi");
      return;
    }
    toast.success(result.message ?? "Güncellendi");
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
      toast.error(result.message ?? "İşlem başarısız");
      return;
    }
    toast.success(result.message ?? "Güncellendi");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Lisans
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSuspension} disabled={pending}>
        {suspended ? "Aktifleştir" : "Askıya al"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${storeName} — lisans yönetimi`}
        description="Eklenen günler mevcut bitiş tarihinin üzerine eklenir. Geçmiş tarihli lisanslarda bugünden itibaren hesaplanır."
      >
        <form onSubmit={onExtend} className="space-y-4">
          <div className="rounded-lg border px-3 py-2 text-[12px] hairline">
            <span className="muted">Mevcut bitiş: </span>
            <span className="font-medium">
              {expiresAt ? new Date(expiresAt).toLocaleDateString("tr-TR") : "Sınırsız"}
            </span>
            <span className="mx-2 muted">·</span>
            <span className="muted">Hesap limiti: </span>
            <span className="font-medium">{maxAccounts ?? "Sınırsız"}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eklenecek gün" hint="Örn. 30">
              <input name="days" type="number" min={1} className="input" placeholder="30" />
            </Field>
            <Field label="Hesap limiti" hint="unlimited yazarak sınırsız yapın.">
              <input
                name="maxAccounts"
                className="input"
                defaultValue={maxAccounts ?? "unlimited"}
                placeholder="unlimited"
              />
            </Field>
          </div>
          <Field label="Bayiye özel süre uzatma linki">
            <input name="renewalUrl" className="input" defaultValue={renewalUrl ?? ""} placeholder="https://..." />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Vazgeç
            </button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              Kaydet
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
}: {
  renewalUrl: string;
  supportEmail: string;
  defaultPlanNote: string;
}) {
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
      setError(result.message ?? "Kaydedilemedi");
      return;
    }
    toast.success(result.message ?? "Kaydedildi");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Destek E-postası">
          <input name="supportEmail" type="email" defaultValue={supportEmail} className="input" required />
        </Field>
        <Field label="Marka adı" hint="Ortam değişkeninden (BRAND_NAME) yönetilir.">
          <input value="BRAND_NAME" readOnly className="input mono text-[12px] opacity-70" />
        </Field>
      </div>
      <Field
        label="Global Süre Uzatma Linki"
        hint="Bayilik kodunda özel link tanımlanmadıysa bu link kullanılır."
      >
        <input name="renewalUrl" defaultValue={renewalUrl} className="input" required />
      </Field>
      <Field label="Bayilere gösterilecek not">
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
          Ayarları kaydet
        </button>
      </div>
    </form>
  );
}
