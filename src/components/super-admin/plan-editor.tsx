"use client";
import { useT } from "@/components/i18n-provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { deletePlan, savePlan } from "@/app/actions/super-admin";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import type { Plan } from "@/lib/plans";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
];

type Draft = {
  id?: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  durationDays: string;
  accountLimit: string;
  features: string;
  purchaseUrl: string;
  highlight: boolean;
  active: boolean;
  sortOrder: string;
  translations: Record<string, { name?: string; description?: string; features?: string[] }>;
};

function emptyDraft(nextOrder: number): Draft {
  return {
    name: "",
    description: "",
    price: "0",
    currency: "TRY",
    durationDays: "30",
    accountLimit: "",
    features: "",
    purchaseUrl: "/bayi",
    highlight: false,
    active: true,
    sortOrder: String(nextOrder),
    translations: {},
  };
}

function toDraft(plan: Plan): Draft {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    durationDays: plan.durationDays === null ? "unlimited" : String(plan.durationDays),
    accountLimit: plan.accountLimit === null ? "unlimited" : String(plan.accountLimit),
    features: plan.features.join("\n"),
    purchaseUrl: plan.purchaseUrl,
    highlight: plan.highlight,
    active: plan.active,
    sortOrder: String(plan.sortOrder),
    translations: plan.translations ?? {},
  };
}

export function PlanEditor({ plans }: { plans: Plan[] }) {
  const t = useT();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState("en");
  const [deleting, setDeleting] = useState<Plan | null>(null);

  function patch(values: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...values } : current));
  }

  function patchTranslation(values: { name?: string; description?: string; features?: string }) {
    setDraft((current) => {
      if (!current) return current;
      const existing = current.translations[lang] ?? {};
      const next = {
        ...existing,
        ...values,
        features:
          values.features !== undefined ? values.features.split("\n").filter((line) => line.trim()) : existing.features,
      };
      return { ...current, translations: { ...current.translations, [lang]: next } };
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    if (draft.id) formData.set("id", String(draft.id));
    formData.set("name", draft.name);
    formData.set("description", draft.description);
    formData.set("price", draft.price);
    formData.set("currency", draft.currency);
    formData.set("durationDays", draft.durationDays);
    formData.set("accountLimit", draft.accountLimit);
    formData.set("features", draft.features);
    formData.set("purchaseUrl", draft.purchaseUrl);
    formData.set("highlight", draft.highlight ? "on" : "off");
    formData.set("active", draft.active ? "true" : "false");
    formData.set("sortOrder", draft.sortOrder);
    formData.set("translations", JSON.stringify(draft.translations));
    const result = await savePlan(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.kaydedilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.ayarlar-kaydedildi"));
    setDraft(null);
    router.refresh();
  }

  async function onDelete() {
    if (!deleting) return;
    const formData = new FormData();
    formData.set("id", String(deleting.id));
    const result = await deletePlan(formData);
    if (!result.ok) {
      toast.error(result.message ?? t("x.silinemedi"));
      return;
    }
    toast.success(result.message ?? t("x.silindi"));
    setDeleting(null);
    router.refresh();
  }

  const translation = draft?.translations[lang] ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{t("x.fiyatlar-ve-paketler")}</h1>
          <p className="mt-1 max-w-2xl text-[12.5px] muted">{t("x.anasayfada-gorunen-fiyat-kartlar-buradan-yonetilir-fiyat")}</p>
        </div>
        <button type="button" onClick={() => setDraft(emptyDraft(plans.length + 1))} className="btn btn-dark btn-sm">
          <Plus size={13} /> {t("x.yeni-paket")}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{plan.name}</p>
                <p className="mt-0.5 text-[11px] muted">
                  {plan.durationDays === null ? t("x.snrsz") : `${plan.durationDays} ${t("x.gun")}`}
                </p>
              </div>
              {plan.highlight ? <Star size={14} className="shrink-0" /> : null}
            </div>
            <p className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">
              {formatMoney(plan.price, plan.currency)}
            </p>
            <ul className="mt-3 flex-1 space-y-1 text-[11.5px] muted">
              {plan.features.slice(0, 4).map((feature, index) => (
                <li key={`${plan.id}-${index}`}>· {feature}</li>
              ))}
            </ul>
            <p className="mt-3 truncate text-[10.5px] muted mono">{plan.purchaseUrl || "—"}</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="btn btn-outline btn-sm flex-1" onClick={() => setDraft(toDraft(plan))}>
                {t("common.edit")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={t("common.delete")}
                onClick={() => setDeleting(plan)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? t("x.paketleri-duzenle") : t("x.yeni-paket")}
        description={t("x.anasayfada-gorunen-fiyat-kartlar-buradan-yonetilir-fiyat")}
        size="lg"
      >
        {draft ? (
          <form onSubmit={onSubmit} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("x.fiyat-plani")}>
                <input
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  className="input"
                  required
                />
              </Field>
              <Field label={t("x.sra")}>
                <input
                  type="number"
                  value={draft.sortOrder}
                  onChange={(event) => patch({ sortOrder: event.target.value })}
                  className="input"
                />
              </Field>
            </div>

            <Field label={t("x.paket-aciklamas")}>
              <textarea
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                className="textarea"
                rows={2}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("x.fiyat-plani")}>
                <input
                  value={draft.price}
                  onChange={(event) => patch({ price: event.target.value })}
                  className="input"
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label={t("x.para-birimi")}>
                <select
                  value={draft.currency}
                  onChange={(event) => patch({ currency: event.target.value })}
                  className="select"
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} {option.symbol}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("x.sure")}>
                <select
                  value={draft.durationDays}
                  onChange={(event) => patch({ durationDays: event.target.value })}
                  className="select"
                >
                  <option value="unlimited">{t("x.snrsz")}</option>
                  <option value="7">7 {t("x.gun")}</option>
                  <option value="30">30 {t("x.gun")}</option>
                  <option value="90">90 {t("x.gun")}</option>
                  <option value="180">180 {t("x.gun")}</option>
                  <option value="365">365 {t("x.gun")}</option>
                  <option value="730">730 {t("x.gun")}</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("x.maksimum-hesap-limiti")}>
                <select
                  value={draft.accountLimit}
                  onChange={(event) => patch({ accountLimit: event.target.value })}
                  className="select"
                >
                  <option value="unlimited">{t("x.snrsz")}</option>
                  <option value="40">40</option>
                  <option value="150">150</option>
                  <option value="500">500</option>
                </select>
              </Field>
              <Field label={t("x.satin-alma-linki")} hint="/bayi · https://odeme.example.com">
                <input
                  value={draft.purchaseUrl}
                  onChange={(event) => patch({ purchaseUrl: event.target.value })}
                  className="input mono text-[12px]"
                  placeholder="https://..."
                />
              </Field>
            </div>

            <Field label={t("x.ozellikler-her-satir-bir-madde")}>
              <textarea
                value={draft.features}
                onChange={(event) => patch({ features: event.target.value })}
                className="textarea mono text-[12px]"
                rows={5}
              />
            </Field>

            <div className="rounded-lg border p-3 hairline">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-medium">{t("x.dil-bazl-iceviri-opsiyonel")}</p>
                <select value={lang} onChange={(event) => setLang(event.target.value)} className="select w-auto text-[12px]">
                  {LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[10.5px] muted">{t("x.bu-dil-icin-bos-braklrsanz-varsaylan-metin-kullanlr")}</p>
              <div className="mt-2 space-y-2">
                <input
                  value={translation.name ?? ""}
                  onChange={(event) => patchTranslation({ name: event.target.value })}
                  className="input"
                  placeholder={draft.name}
                />
                <textarea
                  value={(translation.features ?? []).join("\n")}
                  onChange={(event) => patchTranslation({ features: event.target.value })}
                  className="textarea mono text-[12px]"
                  rows={4}
                  placeholder={draft.features.split("\n").slice(0, 3).join("\n")}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={draft.highlight} onChange={(event) => patch({ highlight: event.target.checked })} />
                {t("x.one-cikan")}
              </label>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={draft.active} onChange={(event) => patch({ active: event.target.checked })} />
                {t("x.yayinda")}
              </label>
            </div>

            {error ? <p className="note note-danger">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-dark" disabled={pending}>
                {pending ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("common.delete")}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              {t("common.delete")}
            </button>
          </>
        }
      >
        <p className="text-[13px]">{deleting?.name}</p>
      </Modal>
    </div>
  );
}
