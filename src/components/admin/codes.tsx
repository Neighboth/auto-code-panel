"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Download, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { createCodes, deleteCode } from "@/app/actions/store-admin";
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
  choice: "Seçmeli (müşteri seçer)",
  single: "Tekli teslimat",
  bundle: "Paket (çoklu)",
};

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
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | AdminCode["status"]>("all");
  const [detail, setDetail] = useState<AdminCode | null>(null);
  const [deleting, setDeleting] = useState<AdminCode | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      label: `${typeLabels[type]}${type === "choice" ? ` (${choiceCount})` : ""} · ${"Sınırsız"}`,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Kod üretilemedi.");
      return;
    }
    setGenerated(result.data?.codes ?? []);
    setStep(4);
    toast.success(result.message ?? "Kodlar üretildi");
    router.refresh();
  }

  async function copyAll() {
    await navigator.clipboard.writeText(generated.join("\n"));
    toast.success("Tüm kodlar kopyalandı");
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
      toast.error(result.message ?? "Silinemedi");
      return;
    }
    toast.success(result.message ?? "Silindi");
    setDeleting(null);
    router.refresh();
  }

  const targetCount = gameIds.length + accountIds.length;
  const canContinue = type === "choice" || targetCount > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Teslimat</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Reedem kodları</h1>
          <p className="mt-1 text-[12.5px] muted">
            Kod süresi son kullanma tarihi değildir; müşteri kodu kullandığı anda başlar.
          </p>
        </div>
        <button type="button" className="btn btn-dark btn-sm" onClick={() => { resetWizard(); setWizardOpen(true); }}>
          <Plus size={13} />
          Kod oluştur
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "Tümü", counts.all],
            ["active", "Aktif", counts.active],
            ["used", "Kullanılmış", counts.used],
            ["expired", "Süresi dolmuş", counts.expired],
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Tür</th>
                <th>Erişim süresi</th>
                <th>Oluşturulma</th>
                <th>Durum</th>
                <th className="text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Wand2 size={20} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">Kod bulunamadı</p>
                    <p className="mt-1 text-[11.5px] muted">Kod sihirbazı ile toplu üretim yapabilirsiniz.</p>
                  </td>
                </tr>
              ) : null}
              {filtered.map((code) => (
                <tr key={code.id}>
                  <td>
                    <p className="mono text-[11.5px] font-medium">{code.code}</p>
                    {code.targetSummary ? <p className="mt-0.5 text-[10.5px] muted">{code.targetSummary}</p> : null}
                  </td>
                  <td>
                    <span className="badge">{typeLabels[code.type]}</span>
                    {code.type === "choice" ? (
                      <span className="ml-1 text-[10.5px] muted">{code.choiceCount} seçim</span>
                    ) : null}
                  </td>
                  <td className="text-[12px]">Sınırsız</td>
                  <td className="text-[11px] muted">{formatDateTime(code.createdAt)}</td>
                  <td>
                    <span
                      className={`badge ${
                        code.status === "active" ? "badge-blue" : code.status === "used" ? "badge-green" : "badge-red"
                      }`}
                    >
                      {code.status === "active" ? "Aktif" : code.status === "used" ? "Kullanılmış" : "Süresi dolmuş"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(code)}>
                        Detay
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
        description={detail ? `${typeLabels[detail.type]} · Sınırsız` : undefined}
        size="lg"
      >
        {detail ? (
          <div className="space-y-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <InfoRow label="Durum" value={detail.status === "active" ? "Kullanılmamış" : detail.status === "used" ? "Kullanılmış" : "Süresi dolmuş"} />
              <InfoRow label="Kullanan müşteri" value={detail.detail?.customerUsername ?? "Misafir kullanıcı"} />
              <InfoRow label="Kullanım tarihi" value={formatDateTime(detail.detail?.grantedAt)} />
              <InfoRow label="Erişim bitişi" value={formatDateTime(detail.detail?.accessExpiresAt)} />
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">Teslim edilen ürünler</p>
              <div className="mt-2 divide-y rounded-lg border hairline">
                {(detail.detail?.items ?? []).length === 0 ? (
                  <p className="px-3 py-3 text-[12px] muted">Henüz teslimat yapılmadı.</p>
                ) : null}
                {detail.detail?.items.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div>
                      <p className="text-[12.5px] font-medium">{item.title}</p>
                      <p className="text-[10.5px] muted">
                        {item.kind === "game" ? "Ürün" : "Hesap"}
                        {item.gameId ? ` · ürün #${item.gameId}` : ""}
                        {item.accountId ? ` · atanan hesap #${item.accountId}` : ""}
                      </p>
                    </div>
                    <span className="badge">{item.accountId ? `Hesap #${item.accountId}` : "Hesap atanmadı"}</span>
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
        title="Kodu sil"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>
              Vazgeç
            </button>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              Sil
            </button>
          </>
        }
      >
        <p className="text-[13px]">
          <span className="mono">{deleting?.code}</span> kodunu silmek istediğinize emin misiniz? Kullanılmış
          kodlar arşiv için saklanır.
        </p>
      </Modal>

      {/* Wizard */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Kod oluştur"
        description="4 adımda teslimat kodu üretin. Erişim süresizdir."
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[11px] muted">Adım {step} / 4</span>
            <div className="flex items-center gap-2">
              {step > 1 && step < 4 ? (
                <button type="button" className="btn btn-outline" onClick={() => setStep(step - 1)}>
                  Geri
                </button>
              ) : null}
              {step === 1 ? (
                <button type="button" className="btn btn-dark" onClick={() => setStep(2)} disabled={!canContinue}>
                  Devam
                </button>
              ) : null}
              {step === 2 ? (
                <button type="button" className="btn btn-dark" onClick={() => setStep(3)}>
                  Devam
                </button>
              ) : null}
        {step === 3 ? (
                <button type="button" className="btn btn-dark" onClick={onGenerate} disabled={pending}>
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={13} />}
                  Oluştur
                </button>
              ) : null}
              {step === 4 ? (
                <button type="button" className="btn btn-dark" onClick={() => setWizardOpen(false)}>
                  Tamam
                </button>
              ) : null}
            </div>
          </div>
        }
      >
        {error ? (
          <p className="mb-3 rounded-md px-2.5 py-1.5 text-[11.5px]" style={{ background: "#fef2f2", color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            {(
              [
                { id: "choice", title: "Seçmeli Kod", text: "Müşteri mağazadaki ürünler arasından hakkı kadar seçim yapar." },
                { id: "single", title: "Tekli Teslimat", text: "Kod tek bir ürün veya hesap grubuna bağlanır." },
                { id: "bundle", title: "Paket Teslimat", text: "Tek koda birden fazla ürün veya hesap tanımlanır." },
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
                  <span className="block text-[12.5px] font-medium">{option.title}</span>
                  <span className="mt-0.5 block text-[11px] muted">{option.text}</span>
                </span>
              </button>
            ))}

            {type === "choice" ? (
              <Field label="Seçim Hakkı" hint="Müşterinin koddan alabileceği ürün adedi (1-20).">
                <select
                  value={choiceCount}
                  onChange={(event) => setChoiceCount(Number(event.target.value))}
                  className="select"
                >
                  {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value} ürün
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div>
                <p className="label">Hedef seçimi ({type === "single" ? "yalnızca 1" : "çoklu"})</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="max-h-44 overflow-y-auto rounded-lg border p-2 hairline scroll-thin">
                    <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] muted">Ürünler</p>
                    {games.length === 0 ? <p className="px-1 py-1 text-[11px] muted">Ürün yok</p> : null}
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
                    <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] muted">
                      Hesap grupları
                    </p>
                    {accounts.length === 0 ? <p className="px-1 py-1 text-[11px] muted">Hesap yok</p> : null}
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
              <p className="text-[12.5px] font-medium">Sınırsız erişim</p>
              <p className="mt-1 text-[11.5px] leading-relaxed muted">
                Bu platform paylaşımlı hesap satışı yapar: kod kullanıldığında erişim kalıcı olarak
                açılır. Teslimatın süresi dolmaz ve hesap “teslim edildi / durdu” moduna geçmez.
              </p>
            </div>
            <p className="text-[11.5px] leading-relaxed muted">
              Seçmeli kodlarda müşteri, koddaki seçim hakkı kadar ürünü kendisi seçer. Tüm ürünler
              süresiz erişimle kütüphaneye eklenir.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <Field label="Kod Adedi" hint="1 ile 500 arasında toplu üretim yapılabilir.">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] muted">Özet</p>
              <div className="mt-2 space-y-1.5 text-[12px]">
                <SummaryRow label="Tür" value={typeLabels[type]} />
                {type === "choice" ? <SummaryRow label="Seçim hakkı" value={`${choiceCount} ürün`} /> : null}
                {type !== "choice" ? <SummaryRow label="Hedef sayısı" value={`${targetCount} öğe`} /> : null}
                <SummaryRow label="Erişim süresi" value="Sınırsız" />
                <SummaryRow label="Adet" value={`${count} kod`} />
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 hairline" style={{ background: "color-mix(in srgb, #16a34a 8%, transparent)" }}>
              <Check size={15} style={{ color: "#16a34a" }} />
              <p className="text-[12px] font-medium">{generated.length} kod üretildi ve listeye eklendi.</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] muted">Her satırda bir kod</p>
              <div className="flex items-center gap-1.5">
                <button type="button" className="btn btn-outline btn-sm" onClick={copyAll}>
                  <Copy size={12} /> Tümünü kopyala
                </button>
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
