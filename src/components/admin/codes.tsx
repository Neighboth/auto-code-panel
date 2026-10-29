"use client";
import { useT } from "@/components/i18n-provider";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Download, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { bulkDeleteCodes, createCodes, deleteCode } from "@/app/actions/store-admin";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export type AdminCode = {
  id: number;
  code: string;
  type: "choice" | "single" | "bundle";
  label: string;
  durationMinutes: number | null;
  choiceCount: number;
  createdAt: string;
  redeemedAt: string | null;
  status: "active" | "used" | "expired";
  targetSummary: string;
  detail: {
    customerUsername: string | null;
    grantedAt: string | null;
    accessExpiresAt: string | null;
    items: { title: string; kind: string; accountId: number | null; gameId: number | null }[];
  } | null;
};

type GameOption = { id: number; title: string };
type AccountOption = { id: number; label: string };

const typeLabels: Record<AdminCode["type"], string> = {
  choice: "x.secmeli-musteri-secer",
  single: "x.tekli-teslimat",
  bundle: "x.paket-coklu",
};

/** `typeLabels` holds dictionary keys, so every render goes through `t`. */
function typeLabel(t: (key: string) => string, type: AdminCode["type"]): string {
  return t(typeLabels[type]);
}

export function CodeManager({
  slug,
  codes,
  games,
  accounts,
}: {
  slug: string;
  codes: AdminCode[];
  games: GameOption[];
  accounts: AccountOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | AdminCode["status"]>("all");
  const [detail, setDetail] = useState<AdminCode | null>(null);
  const [deleting, setDeleting] = useState<AdminCode | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [step, setStep] = useState(1);
  const [type, setType] = useState<AdminCode["type"]>("choice");
  const [choiceCount, setChoiceCount] = useState(2);
  const [gameIds, setGameIds] = useState<number[]>([]);
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [count, setCount] = useState(1);
  const [generated, setGenerated] = useState<string[]>([]);

  const filtered = useMemo(
    () => (filter === "all" ? codes : codes.filter((code) => code.status === filter)),
    [codes, filter],
  );

  const counts = useMemo(
    () => ({
      all: codes.length,
      active: codes.filter((code) => code.status === "active").length,
      used: codes.filter((code) => code.status === "used").length,
      expired: codes.filter((code) => code.status === "expired").length,
    }),
    [codes],
  );

  function resetWizard() {
    setStep(1);
    setType("choice");
    setChoiceCount(2);
    setGameIds([]);
    setAccountIds([]);
    setCount(1);
    setGenerated([]);
    setError(null);
  }

  /**
   * The platform delivers shared accounts: access is never time limited.
   * Codes therefore always carry a null duration (unlimited).
   */
  function durationMinutes(): number | null {
    return null;
  }

  function toggleTarget(kind: "game" | "account", id: number) {
    if (type === "single") {
      if (kind === "game") {
        setGameIds([id]);
        setAccountIds([]);
      } else {
        setAccountIds([id]);
        setGameIds([]);
      }
      return;
    }
    if (kind === "game") {
      setGameIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    } else {
      setAccountIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    }
  }

  async function onGenerate() {
    setPending(true);
    setError(null);
    const result = await createCodes({
      slug,
      type,
      choiceCount,
      durationMinutes: durationMinutes(),
      gameIds,
      accountIds,
      count,
      label: `${typeLabel(t, type)}${type === "choice" ? ` (${choiceCount})` : ""} · ${t("x.snrsz")}`,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.kod-uretilemedi"));
      return;
    }
    setGenerated(result.data?.codes ?? []);
    setStep(4);
    toast.success(result.message ?? t("x.kodlar-uretildi"));
    router.refresh();
  }

  async function copyAll() {
    await navigator.clipboard.writeText(generated.join("\n"));
    toast.success(t("x.tum-kodlar-kopyaland"));
  }

  function download() {
    const blob = new Blob([generated.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kodlar-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function onDelete() {
    if (!deleting) return;
    setPending(true);
    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("id", String(deleting.id));
    const result = await deleteCode(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.silinemedi"));
      return;
    }
    toast.success(result.message ?? t("x.silindi"));
    setDeleting(null);
    router.refresh();
  }

  function toggleSelect(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function onBulkDelete() {
    setPending(true);
    const result = await bulkDeleteCodes(slug, selected);
    setPending(false);
    setBulkOpen(false);
    if (!result.ok) {
      toast.error(result.message ?? t("x.silinemedi"));
      return;
    }
    toast.success(result.message ?? t("x.kodlar-silindi"));
    setSelected([]);
    router.refresh();
  }

  async function copySelected() {
    const codes = filtered.filter((code) => selected.includes(code.id)).map((code) => code.code);
    if (codes.length === 0) return;
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success(t("x.count-kod-kopyaland", { count: codes.length }));
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((code) => selected.includes(code.id));

  const targetCount = gameIds.length + accountIds.length;
  const canContinue = type === "choice" || targetCount > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{t("x.teslimat")}</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">{" "}{t("x.reedem-kodlar")}</h1>
          <p className="mt-1 text-[12.5px] muted">{t("x.kod-suresi-son-kullanma-tarihi-degildir-musteri-kodu-kul")}</p>
        </div>
        <button type="button" className="btn btn-dark btn-sm" onClick={() => { resetWizard(); setWizardOpen(true); }}>
          <Plus size={13} />{t("x.kod-olustur")}</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", t("x.tumu"), counts.all],
            ["active", t("x.aktif"), counts.active],
            ["used", t("x.kullanlms"), counts.used],
            ["expired", t("x.suresi-dolmus"), counts.expired],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition hairline"
            style={{
              background: filter === key ? "var(--store-primary)" : "transparent",
              color: filter === key ? "#fff" : "var(--fg-muted)",
            }}
          >
            {label} <span className="tabular-nums opacity-70">{value}</span>
          </button>
        ))}
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 py-2.5 hairline">
          <span className="text-[12px] font-medium">{t("x.count-kod-secildi", { count: selected.length })}</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-outline btn-sm" onClick={copySelected}>
            <Copy size={12} /> Kopyala
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setBulkOpen(true)}>
            <Trash2 size={12} />{t("x.secilenleri-sil")}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
            Temizle
          </button>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-9">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label={t("x.gorunen-kodlar-sec")}
                    checked={allVisibleSelected}
                    onChange={(event) => setSelected(event.target.checked ? filtered.map((code) => code.id) : [])}
                  />
                </th>
                <th>{t("x.kod")}</th>
                <th>{t("x.tur")}</th>
                <th>{" "}{t("x.erisim-suresi")}</th>
                <th>{t("x.olusturulma")}</th>
                <th>{t("x.durum")}</th>
                <th className="text-right">{t("x.islem")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Wand2 size={20} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">{" "}{t("x.kod-bulunamad")}</p>
                    <p className="mt-1 text-[11.5px] muted">{" "}{t("x.kod-sihirbaz-ile-toplu-uretim-yapabilirsiniz")}</p>
                  </td>
                </tr>
              ) : null}
              {filtered.map((code) => (
                <tr key={code.id} className={selected.includes(code.id) ? "bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label={t("x.name-sec", { name: code.code })}
                      checked={selected.includes(code.id)}
                      onChange={() => toggleSelect(code.id)}
                    />
                  </td>
                  <td>
                    <p className="mono text-[11.5px] font-medium">{code.code}</p>
                    {code.targetSummary ? <p className="mt-0.5 text-[10.5px] muted">{code.targetSummary}</p> : null}
                  </td>
                  <td>
                    <span className="badge">{typeLabel(t, code.type)}</span>
                    {code.type === "choice" ? (
                      <span className="ml-1 text-[10.5px] muted">{t("x.count-secim", { count: code.choiceCount })}</span>
                    ) : null}
                  </td>
                  <td className="text-[12px]">{t("x.snrsz")}</td>
                  <td className="text-[11px] muted">{formatDateTime(code.createdAt)}</td>
                  <td>
                    <span
                      className={`badge ${
                        code.status === "active" ? "badge-blue" : code.status === "used" ? "badge-green" : "badge-red"
                      }`}
                    >
                      {code.status === "active" ? t("x.aktif") : code.status === "used" ? t("x.kullanlms") : t("x.suresi-dolmus")}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(code)}>
                        {t("x.detay")}
                      </button>
                      {code.status === "active" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "#dc2626" }}
                          onClick={() => setDeleting(code)}
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.code}
        description={detail ? `${typeLabel(t, detail.type)} · ${t("x.snrsz")}` : undefined}
        size="lg"
      >
        {detail ? (
          <div className="space-y-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <InfoRow label={t("x.durum")} value={detail.status === "active" ? t("x.kullanlmams") : detail.status === "used" ? t("x.kullanlms") : t("x.suresi-dolmus")} />
              <InfoRow label={t("x.kullanan-musteri")} value={detail.detail?.customerUsername ?? t("x.misafir-kullanc")} />
              <InfoRow label={t("x.kullanm-tarihi")} value={formatDateTime(detail.detail?.grantedAt)} />
              <InfoRow label={t("x.erisim-bitisi")} value={formatDateTime(detail.detail?.accessExpiresAt)} />
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">{" "}{t("x.teslim-edilen-urunler")}</p>
              <div className="mt-2 divide-y rounded-lg border hairline">
                {(detail.detail?.items ?? []).length === 0 ? (
                  <p className="px-3 py-3 text-[12px] muted">{" "}{t("x.henuz-teslimat-yaplmad")}</p>
                ) : null}
                {detail.detail?.items.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div>
                      <p className="text-[12.5px] font-medium">{item.title}</p>
                      <p className="text-[10.5px] muted">
                        {item.kind === "game" ? t("x.urun") : "Hesap"}
                        {item.gameId ? ` · ${t("x.urun-id", { id: item.gameId })}` : ""}
                        {item.accountId ? ` · atanan hesap #${item.accountId}` : ""}
                      </p>
                    </div>
                    <span className="badge">{item.accountId ? `Hesap #${item.accountId}` : t("x.hesap-atanmad")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Delete */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("x.kodu-sil")}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>{t("x.vazgec")}</button>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              {t("x.sil")}
            </button>
          </>
        }
      >
        <p className="text-[13px]">
          <span className="mono">{deleting?.code}</span>{t("x.kodunu-silmek-istediginize-emin-misiniz-kullanlms-kodlar")}</p>
      </Modal>

      {/* Bulk delete */}
      <Modal
        open={bulkOpen}
        onClose={() => (pending ? undefined : setBulkOpen(false))}
        title={t("x.secili-kodlar-sil")}
        description={t("x.count-kod-secildi", { count: selected.length })}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setBulkOpen(false)} disabled={pending}>{t("x.vazgec")}</button>
            <button type="button" className="btn btn-danger" onClick={onBulkDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              {t("x.secilenleri-sil")}
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed">{t("x.secili-kodlar-silinecek-kullanlms-kodlar-teslimat-kayd-o")}</p>
      </Modal>

      {/* Wizard */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={t("x.kod-olustur")}
        description={t("x.4-admda-teslimat-kodu-uretin-erisim-suresizdir")}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[11px] muted">{t("x.adm-step-4", { step })}</span>
            <div className="flex items-center gap-2">
              {step > 1 && step < 4 ? (
                <button type="button" className="btn btn-outline" onClick={() => setStep(step - 1)}>
                  {t("x.geri")}
                </button>
              ) : null}
              {step === 1 ? (
                <button type="button" className="btn btn-dark" onClick={() => setStep(2)} disabled={!canContinue}>
                  {t("x.devam")}
                </button>
              ) : null}
              {step === 2 ? (
                <button type="button" className="btn btn-dark" onClick={() => setStep(3)}>
                  {t("x.devam")}
                </button>
              ) : null}
        {step === 3 ? (
                <button type="button" className="btn btn-dark" onClick={onGenerate} disabled={pending}>
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={13} />}
                  {t("x.olustur")}
                </button>
              ) : null}
              {step === 4 ? (
                <button type="button" className="btn btn-dark" onClick={() => setWizardOpen(false)}>
                  {t("x.tamam")}
                </button>
              ) : null}
            </div>
          </div>
        }
      >
        {error ? (
          <p className="note note-danger mb-3 text-[11.5px]">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            {(
              [
                { id: "choice", title: t("x.secmeli-kod"), text: t("x.musteri-magazadaki-urunler-arasndan-hakk-kadar-secim-yap") },
                { id: "single", title: t("x.tekli-teslimat"), text: t("x.kod-tek-bir-urun-veya-hesap-grubuna-baglanr") },
                { id: "bundle", title: t("x.paket-teslimat"), text: t("x.tek-koda-birden-fazla-urun-veya-hesap-tanmlanr") },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setType(option.id)}
                className="flex w-full items-start gap-3 rounded-xl border p-3 text-left hairline"
                style={{
                  borderColor: type === option.id ? "var(--store-primary)" : "var(--border)",
                  background: type === option.id ? "color-mix(in srgb, var(--store-primary) 4%, transparent)" : "transparent",
                }}
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: type === option.id ? "var(--store-primary)" : "var(--border-strong)" }}
                >
                  {type === option.id ? <span className="h-2 w-2 rounded-full" style={{ background: "var(--store-primary)" }} /> : null}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium">{t(option.title)}</span>
                  <span className="mt-0.5 block text-[11px] muted">{option.text}</span>
                </span>
              </button>
            ))}

            {type === "choice" ? (
              <Field label={t("x.secim-hakk")} hint={t("x.musterinin-koddan-alabilecegi-urun-adedi-1-20")}>
                <select
                  value={choiceCount}
                  onChange={(event) => setChoiceCount(Number(event.target.value))}
                  className="select"
                >
                  {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {t("x.count-urun", { count: value })}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div>
                <p className="label">{t("x.hedef-secimi-mode", { mode: type === "single" ? t("x.yalnzca-1") : t("x.coklu") })}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="max-h-44 overflow-y-auto rounded-lg border p-2 hairline scroll-thin">
                    <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] muted">{t("x.urunler")}</p>
                    {games.length === 0 ? <p className="px-1 py-1 text-[11px] muted">{" "}{t("x.urun-yok")}</p> : null}
                    {games.map((game) => (
                      <label key={game.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-[11.5px]">
                        <input
                          type={type === "single" ? "radio" : "checkbox"}
                          checked={gameIds.includes(game.id)}
                          onChange={() => toggleTarget("game", game.id)}
                        />
                        {game.title}
                      </label>
                    ))}
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-lg border p-2 hairline scroll-thin">
                    <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] muted">{t("x.hesap-gruplar")}</p>
                    {accounts.length === 0 ? <p className="px-1 py-1 text-[11px] muted">{t("x.hesap-yok")}</p> : null}
                    {accounts.map((account) => (
                      <label key={account.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-[11.5px]">
                        <input
                          type={type === "single" ? "radio" : "checkbox"}
                          checked={accountIds.includes(account.id)}
                          onChange={() => toggleTarget("account", account.id)}
                        />
                        {account.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <div className="rounded-xl border p-3.5 hairline">
              <p className="text-[12.5px] font-medium">{" "}{t("x.snrsz-erisim")}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed muted">{t("x.bu-platform-paylasml-hesap-sats-yapar-kod-kullanldgnda-e")}</p>
            </div>
            <p className="text-[11.5px] leading-relaxed muted">{t("x.secmeli-kodlarda-musteri-koddaki-secim-hakk-kadar-urunu")}</p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <Field label={t("x.kod-adedi")} hint={t("x.1-ile-500-arasnda-toplu-uretim-yaplabilir")}>
              <input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(event) => setCount(Math.min(500, Math.max(1, Number(event.target.value) || 1)))}
                className="input"
              />
            </Field>
            <div className="rounded-lg border p-3 hairline">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] muted">{t("x.ozet")}</p>
              <div className="mt-2 space-y-1.5 text-[12px]">
                <SummaryRow label={t("x.tur")} value={typeLabel(t, type)} />
                {type === "choice" ? <SummaryRow label={t("x.secim-hakk-2")} value={t("x.count-urun", { count: choiceCount })} /> : null}
                {type !== "choice" ? <SummaryRow label={t("x.hedef-says")} value={t("x.count-oge", { count: targetCount })} /> : null}
                <SummaryRow label={t("x.erisim-suresi")} value={t("x.snrsz")} />
                <SummaryRow label={t("x.adet")} value={`${count} kod`} />
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 hairline" style={{ background: "color-mix(in srgb, #16a34a 8%, transparent)" }}>
              <Check size={15} style={{ color: "#16a34a" }} />
              <p className="text-[12px] font-medium">{t("x.count-kod-uretildi-ve-listeye-eklendi", { count: generated.length })}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] muted">{" "}{t("x.her-satrda-bir-kod")}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" className="btn btn-outline btn-sm" onClick={copyAll}>
                  <Copy size={12} />{t("x.tumunu-kopyala")}</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={download}>
                  <Download size={12} /> .TXT indir
                </button>
              </div>
            </div>
            <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border p-3 text-[12px] hairline scroll-thin" style={{ background: "var(--bg)" }}>
              {generated.join("\n")}
            </pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2 hairline">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">{label}</p>
      <p className="mt-0.5 text-[12.5px] font-medium">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
