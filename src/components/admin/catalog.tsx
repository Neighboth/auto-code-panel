"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Boxes,
  CloudDownload,
  Fingerprint,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";
import {
  bulkUpdateProductPrices,
  deleteAccount,
  deleteGame,
  saveAccount,
  saveGame,
  importAccountsCsv,
  importProductsCsv,
  setAccountStatus,
  steamLookup,
  syncSteamNow,
  testAccessCode,
  type AccessCodeTest,
} from "@/app/actions/store-admin";
import { Modal } from "@/components/modal";
import { CsvImportButton } from "@/components/admin/csv-import";
import { Field } from "@/components/ui";
import {
  GUARD_OPTIONS,
  PLATFORM_GROUPS,
  PLATFORM_PRESETS,
  guardHasEmail,
  guardHasSteam,
  guardHasTotp,
} from "@/lib/fonts";
import { formatDateTime, formatMoney, remainingShort } from "@/lib/format";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { MAIL_PRESETS } from "@/lib/mail-presets";
import { convertLocal, fetchRates, type RateTable } from "@/lib/fx-client";

export type AdminGame = {
  id: number;
  title: string;
  description: string;
  salesUrl: string;
  steamUrl: string;
  steamAppId: string | null;
  originalPrice: string | null;
  originalCurrency: string;
  ourPrice: string;
  currency: string;
  coverImage: string;
  autoSync: boolean;
  lastSyncedAt: string | null;
};

export type AdminAccount = {
  id: number;
  platform: string;
  platformLabel: string;
  username: string | null;
  email: string | null;
  password: string;
  productLabel: string;
  linkedGameIds: number[];
  guardType: string;
  hasSteamSecret: boolean;
  hasTotpSecret: boolean;
  mailEmail: string | null;
  mailPassword: string | null;
  mailProvider: string;
  mailHost: string | null;
  mailPort: number | null;
  mailSenderFilter: string;
  notes: string;
  status: string;
};

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="note note-danger">{message}</p>;
}

function useFxRates(): RateTable {
  const [rates, setRates] = useState<RateTable>({});
  // Snapshot of "now" so the render stays pure.
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    void fetchRates().then((table) => {
      if (!cancelled) setRates(table);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return rates;
}

/* ------------------------------- Products ------------------------------- */

export function GameManager({ slug, games }: { slug: string; games: AdminGame[] }) {
  const router = useRouter();
  const rates = useFxRates();
  const [editing, setEditing] = useState<AdminGame | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminGame | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"percent" | "amount">("percent");
  const [bulkValue, setBulkValue] = useState("10");

  const emptyForm = useMemo(
    () => ({
      title: "",
      description: "",
      salesUrl: "",
      steamUrl: "",
      originalPrice: "",
      originalCurrency: "TRY",
      ourPrice: "",
      coverImage: "",
      autoSync: true,
      currency: "TRY",
    }),
    [],
  );
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(game: AdminGame) {
    setEditing(game);
    setForm({
      title: game.title,
      description: game.description,
      salesUrl: game.salesUrl,
      steamUrl: game.steamUrl,
      originalPrice: game.originalPrice ?? "",
      originalCurrency: game.originalCurrency,
      ourPrice: game.ourPrice,
      coverImage: game.coverImage,
      autoSync: game.autoSync,
      currency: game.currency,
    });
    setError(null);
    setOpen(true);
  }

  /** Changing the currency converts every price box immediately. */
  function onCurrencyChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    setForm((current) => ({
      ...current,
      currency: next,
      originalPrice: current.originalPrice
        ? convertLocal(current.originalPrice, current.originalCurrency, next, rates)
        : current.originalPrice,
      ourPrice: current.ourPrice
        ? convertLocal(current.ourPrice, current.currency, next, rates)
        : current.ourPrice,
      originalCurrency: next,
    }));
  }

  async function onSteamLookup() {
    if (!form.steamUrl) {
      setError("Önce Steam mağaza linkini girin.");
      return;
    }
    setLookupPending(true);
    setError(null);
    const result = await steamLookup(form.steamUrl, form.currency);
    setLookupPending(false);
    if (!result.ok || !result.data) {
      setError(result.message ?? "Steam bilgisi alınamadı.");
      return;
    }
    const data = result.data;
    setForm((current) => ({
      ...current,
      title: data.title || current.title,
      description: current.description || data.shortDescription,
      coverImage: data.headerImage || current.coverImage,
      originalPrice:
        data.originalPrice !== null ? String(data.originalPrice) : current.originalPrice,
      originalCurrency: current.currency,
    }));
    toast.success(result.message ?? "Steam bilgileri dolduruldu");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", slug);
    if (editing) formData.set("id", String(editing.id));
    formData.set("autoSync", form.autoSync ? "true" : "false");
    const result = await saveGame(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Kaydedilemedi.");
      return;
    }
    toast.success(result.message ?? "Kaydedildi");
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    if (!deleting) return;
    setPending(true);
    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("id", String(deleting.id));
    const result = await deleteGame(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Silinemedi");
      return;
    }
    toast.success(result.message ?? "Silindi");
    setDeleting(null);
    router.refresh();
  }

  function toggleSelect(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function onBulkPrice() {
    if (selected.length === 0) return;
    const result = await bulkUpdateProductPrices(slug, selected, bulkMode, Number(bulkValue.replace(",", ".")));
    if (!result.ok) {
      toast.error(result.message ?? "Fiyatlar güncellenemedi");
      return;
    }
    toast.success(result.message ?? "Fiyatlar güncellendi");
    setBulkOpen(false);
    setSelected([]);
    router.refresh();
  }

  async function onSync() {
    setPending(true);
    const formData = new FormData();
    formData.set("slug", slug);
    const result = await syncSteamNow(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Senkronizasyon başarısız");
      return;
    }
    toast.success(result.message ?? "Senkronize edildi");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Vitrin yönetimi</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Ürünler & oyunlar</h1>
          <p className="mt-1 text-[12.5px] muted">
            {games.length} ürün · Oyun, abonelik veya dijital ürün ekleyin. Steam linki girildiğinde
            başlık, kapak ve resmi fiyat otomatik çekilip seçili para birimine çevrilir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onSync} disabled={pending}>
            {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Steam senkronize et
          </button>
          <CsvImportButton kind="products" action={(csv) => importProductsCsv(slug, csv)} />
          <button type="button" className="btn btn-dark btn-sm" onClick={openCreate}>
            <Plus size={13} />
            Yeni ürün
          </button>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 py-2.5 hairline">
          <span className="text-[12px] font-medium">{selected.length} ürün seçildi</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setBulkOpen(true)}>
            <Tags size={12} /> Toplu fiyat
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
            Temizle
          </button>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th className="w-9">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label="Tüm ürünleri seç"
                    checked={games.length > 0 && selected.length === games.length}
                    onChange={(event) => setSelected(event.target.checked ? games.map((game) => game.id) : [])}
                  />
                </th>
                <th>Ürün</th>
                <th>Orijinal</th>
                <th>Bizim fiyat</th>
                <th>Auto-sync</th>
                <th>Son senkron</th>
                <th className="text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {games.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Boxes size={22} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">Henüz ürün yok</p>
                    <p className="mt-1 text-[11.5px] muted">
                      Steam linki veya manuel giriş ile ilk ürününüzü ekleyin.
                    </p>
                  </td>
                </tr>
              ) : null}
              {games.map((game) => (
                <tr key={game.id}>
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label={`${game.title} seç`}
                      checked={selected.includes(game.id)}
                      onChange={() => toggleSelect(game.id)}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="h-9 w-16 shrink-0 overflow-hidden rounded-md" style={{ background: "var(--bg)" }}>
                        {game.coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                    loading="lazy"
                    decoding="async" src={game.coverImage} alt={game.title} className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium">{game.title}</p>
                        <p className="truncate text-[10.5px] muted">
                          {game.steamAppId ? `Steam AppID ${game.steamAppId}` : "Manuel ürün"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-[12px] tabular-nums">{formatMoney(game.originalPrice, game.currency)}</td>
                  <td className="text-[12px] font-medium tabular-nums">{formatMoney(game.ourPrice, game.currency)}</td>
                  <td>
                    <span className={`badge ${game.autoSync ? "badge-blue" : ""}`}>
                      {game.autoSync ? "Açık" : "Kapalı"}
                    </span>
                  </td>
                  <td className="text-[11px] muted">{game.lastSyncedAt ? formatDateTime(game.lastSyncedAt) : "—"}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(game)}>
                        <Pencil size={12} />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: "#dc2626" }}
                        onClick={() => setDeleting(game)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Ürünü düzenle" : "Yeni ürün ekle"}
        description="Oyun, abonelik veya dijital ürün. Steam linki opsiyoneldir; fiyatlar seçili para birimine dönüştürülür."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <Field label="Steam Mağaza Linki (opsiyonel)">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                name="steamUrl"
                value={form.steamUrl}
                onChange={(event) => setForm((current) => ({ ...current, steamUrl: event.target.value }))}
                placeholder="https://store.steampowered.com/app/1091500/"
                className="input mono text-[12px]"
              />
              <button
                type="button"
                className="btn btn-outline shrink-0"
                onClick={onSteamLookup}
                disabled={lookupPending}
              >
                {lookupPending ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
                Steam&apos;den çek
              </button>
            </div>
          </Field>
          <Field label="Ürün adı">
            <input
              name="title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="input"
              placeholder="Örn. Cyberpunk 2077 veya ChatGPT Plus"
              required
            />
          </Field>
          <Field label="Açıklama">
            <textarea
              name="description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="textarea"
              rows={3}
              placeholder="Ürün hakkında kısa bilgi, teslim şekli, kullanım notları…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Satış İlan Linki" hint="Itemsatış vb. dış ilan adresi (opsiyonel).">
              <input
                name="salesUrl"
                value={form.salesUrl}
                onChange={(event) => setForm((current) => ({ ...current, salesUrl: event.target.value }))}
                className="input"
                placeholder="https://www.itemsatis.com/..."
              />
            </Field>
            <Field label="Kapak görseli URL">
              <input
                name="coverImage"
                value={form.coverImage}
                onChange={(event) => setForm((current) => ({ ...current, coverImage: event.target.value }))}
                className="input"
                placeholder="https://..."
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="originalCurrency" value={form.originalCurrency} />
            <Field label="Orijinal fiyat">
              <input
                name="originalPrice"
                value={form.originalPrice}
                onChange={(event) => setForm((current) => ({ ...current, originalPrice: event.target.value }))}
                className="input"
                placeholder="1999.00"
                inputMode="decimal"
              />
            </Field>
            <Field label="Bizim fiyatımız">
              <input
                name="ourPrice"
                value={form.ourPrice}
                onChange={(event) => setForm((current) => ({ ...current, ourPrice: event.target.value }))}
                className="input"
                placeholder="349.90"
                required
                inputMode="decimal"
              />
            </Field>
            <Field label="Para birimi">
              <select name="currency" value={form.currency} onChange={onCurrencyChange} className="select">
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} {option.symbol}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-[11px] muted">
            Para birimini değiştirdiğinizde fiyat kutuları güncel kurla otomatik dönüştürülür. Steam
            fiyatı her zaman seçili birime çevrilerek kaydedilir.
          </p>
          <label className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] hairline">
            <input
              type="checkbox"
              checked={form.autoSync}
              onChange={(event) => setForm((current) => ({ ...current, autoSync: event.target.checked }))}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Otomatik senkronizasyon (Auto-Sync)</span>
              <span className="mt-0.5 block text-[11px] muted">
                Açıkken cron görevi Steam&apos;den güncel fiyat, başlık ve kapağı çekip bu ürünü günceller.
              </span>
            </span>
          </label>
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Vazgeç
            </button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? "Güncelle" : "Ürünü kaydet"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Ürünü sil"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>
              Vazgeç
            </button>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              Kalıcı olarak sil
            </button>
          </>
        }
      >
        <p className="text-[13px]">
          <strong>{deleting?.title}</strong> ürününü silmek istediğinize emin misiniz? Bağlı kodlar
          varsa silme işlemi engellenir.
        </p>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Toplu fiyat güncelle"
        description={`${selected.length} ürün seçildi`}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setBulkOpen(false)}>
              Vazgeç
            </button>
            <button type="button" className="btn btn-dark" onClick={onBulkPrice}>
              Uygula
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="İşlem türü" htmlFor="bulkMode">
            <select
              id="bulkMode"
              className="select"
              value={bulkMode}
              onChange={(event) => setBulkMode(event.target.value as "percent" | "amount")}
            >
              <option value="percent">Yüzde olarak değiştir (%)</option>
              <option value="amount">Tutar kadar değiştir</option>
            </select>
          </Field>
          <Field
            label={bulkMode === "percent" ? "Yüzde" : "Tutar"}
            hint={
              bulkMode === "percent"
                ? "Negatif değer indirim uygular. Örnek: -15 → fiyatlar %15 düşer."
                : "Negatif değer indirim uygular. Örnek: -50 → her fiyattan 50 birim düşülür."
            }
            htmlFor="bulkValue"
          >
            <input
              id="bulkValue"
              className="input"
              inputMode="decimal"
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
            />
          </Field>
          <p className="text-[11.5px] leading-relaxed muted">
            Fiyatlar ürünün kendi para biriminde güncellenir. Sıfır veya altına düşecek ürünler atlanır.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ Accounts ----------------------------- */

type AccountForm = {
  platform: string;
  platformLabel: string;
  username: string;
  email: string;
  password: string;
  productLabel: string;
  guardType: string;
  steamSecret: string;
  totpSecret: string;
  mailProvider: string;
  mailEmail: string;
  mailPassword: string;
  mailHost: string;
  mailPort: string;
  mailSenderFilter: string;
  notes: string;
  linkedGameIds: number[];
};

const emptyAccount: AccountForm = {
  platform: "steam",
  platformLabel: "",
  username: "",
  email: "",
  password: "",
  productLabel: "",
  guardType: "steam_guard",
  steamSecret: "",
  totpSecret: "",
  mailProvider: "gmail",
  mailEmail: "",
  mailPassword: "",
  mailHost: "imap.gmail.com",
  mailPort: "993",
  mailSenderFilter: "steam",
  notes: "",
  linkedGameIds: [],
};

export function AccountManager({
  slug,
  accounts,
  games,
  quota,
}: {
  slug: string;
  accounts: AdminAccount[];
  games: { id: number; title: string }[];
  quota: { used: number; max: number | null; reached: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminAccount | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<AccessCodeTest[] | null>(null);
  // Snapshot of "now" so the render stays pure.
  const [now] = useState(() => Date.now());

  const preset = PLATFORM_PRESETS.find((item) => item.id === form.platform);
  const isSteam = preset?.kind === "steam";
  const guardOptions = useMemo(
    () =>
      GUARD_OPTIONS.filter((option) => {
        if (isSteam) return !option.id.startsWith("totp");
        return !option.id.startsWith("steam_guard");
      }),
    [isSteam],
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyAccount });
    setError(null);
    setTestResults(null);
    setOpen(true);
  }

  function openEdit(account: AdminAccount) {
    setEditing(account);
    setForm({
      platform: account.platform,
      platformLabel: account.platformLabel,
      username: account.username ?? "",
      email: account.email ?? "",
      password: account.password,
      productLabel: account.productLabel,
      guardType: account.guardType,
      steamSecret: "",
      totpSecret: "",
      mailProvider: account.mailProvider || "gmail",
      mailEmail: account.mailEmail ?? "",
      mailPassword: "",
      mailHost: account.mailHost ?? "",
      mailPort: account.mailPort ? String(account.mailPort) : "993",
      mailSenderFilter: account.mailSenderFilter || "steam",
      notes: account.notes,
      linkedGameIds: account.linkedGameIds,
    });
    setError(null);
    setTestResults(null);
    setOpen(true);
  }

  function patch(values: Partial<AccountForm>) {
    setForm((current) => ({ ...current, ...values }));
  }

  function onPlatformChange(platform: string) {
    const nextPreset = PLATFORM_PRESETS.find((item) => item.id === platform);
    const nextSteam = nextPreset?.kind === "steam";
    setForm((current) => ({
      ...current,
      platform,
      guardType: nextSteam ? "steam_guard" : "totp",
      platformLabel: platform === "custom" ? current.platformLabel : nextPreset?.label ?? "",
      mailSenderFilter: nextSteam ? "steam" : current.mailSenderFilter,
    }));
  }

  function onMailProvider(providerId: string) {
    const provider = MAIL_PRESETS.find((item) => item.id === providerId);
    patch({
      mailProvider: providerId,
      mailHost: provider?.host ?? "",
      mailPort: provider ? String(provider.port) : "993",
    });
  }

  async function onTest() {
    setTesting(true);
    setError(null);
    setTestResults(null);
    const result = await testAccessCode(slug, editing?.id ?? null, {
      guardType: form.guardType,
      steamSecret: form.steamSecret || undefined,
      totpSecret: form.totpSecret || undefined,
      mailEmail: form.mailEmail || undefined,
      mailPassword: form.mailPassword || undefined,
      mailProvider: form.mailProvider,
      mailHost: form.mailHost || undefined,
      mailPort: form.mailPort ? Number(form.mailPort) : null,
      mailSenderFilter: form.mailSenderFilter,
    });
    setTesting(false);
    if (!result.ok || !result.data) {
      setError(result.message ?? "Kod üretilemedi.");
      return;
    }
    setTestResults(result.data.results);
    toast.success("Kod üretildi, kontrol edebilirsiniz");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", slug);
    formData.set("guardType", form.guardType);
    formData.set("platform", form.platform);
    formData.set("linkedGameIds", JSON.stringify(form.linkedGameIds));
    formData.set("mailProvider", form.mailProvider);
    formData.set("mailPort", form.mailPort);
    if (editing) formData.set("id", String(editing.id));
    const result = await saveAccount(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Kaydedilemedi.");
      return;
    }
    toast.success(result.message ?? "Kaydedildi");
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    if (!deleting) return;
    setPending(true);
    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("id", String(deleting.id));
    const result = await deleteAccount(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message ?? "Silinemedi");
      return;
    }
    toast.success(result.message ?? "Silindi");
    setDeleting(null);
    router.refresh();
  }

  async function onToggle(account: AdminAccount) {
    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("id", String(account.id));
    formData.set("status", account.status === "retired" ? "available" : "retired");
    const result = await setAccountStatus(formData);
    if (!result.ok) {
      toast.error(result.message ?? "Güncellenemedi");
      return;
    }
    toast.success(result.message ?? "Güncellendi");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Envanter</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Hesaplar & 2FA / Guard</h1>
          <p className="mt-1 text-[12.5px] muted">
            {quota.used} / {quota.max ?? "sınırsız"} hesap · Paylaşımlı hesaplar süresiz teslim edilir.
            Secret anahtarları şifreli saklanır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvImportButton kind="accounts" action={(csv) => importAccountsCsv(slug, csv)} />
          <button
            type="button"
            className="btn btn-dark btn-sm"
            onClick={openCreate}
            disabled={quota.reached}
            title={quota.reached ? "Hesap limiti dolu" : undefined}
          >
            <Plus size={13} />
            Yeni hesap
          </button>
        </div>
      </div>

      {quota.reached ? (
        <div className="note note-warn">
          Bayilik paketinizin hesap limiti doldu. Yeni hesap eklemek için paketinizi yükseltin.
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th>Platform / hesap</th>
                <th>Bağlı ürün</th>
                <th>Koruma</th>
                <th>Durum</th>
                <th className="text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Sparkles size={20} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">Envanter boş</p>
                    <p className="mt-1 text-[11.5px] muted">
                      Steam, ChatGPT, Netflix veya herhangi bir platformdan hesap ekleyin.
                    </p>
                  </td>
                </tr>
              ) : null}
              {accounts.map((account) => {
                const linked = games.filter((game) => account.linkedGameIds.includes(game.id));
                return (
                  <tr key={account.id}>
                    <td>
                      <p className="text-[12.5px] font-medium">{account.username || account.email || "—"}</p>
                      <p className="text-[10.5px] muted">
                        {account.platformLabel}
                        {account.productLabel ? ` · ${account.productLabel}` : ""}
                      </p>
                    </td>
                    <td>
                      {linked.length === 0 ? (
                        <span className="text-[11px] muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {linked.slice(0, 2).map((game) => (
                            <span key={game.id} className="badge">
                              {game.title}
                            </span>
                          ))}
                          {linked.length > 2 ? <span className="badge">+{linked.length - 2}</span> : null}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${account.guardType === "none" ? "" : "badge-blue"}`}>
                        {GUARD_OPTIONS.find((option) => option.id === account.guardType)?.label ?? "2FA yok"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${account.status === "available" ? "badge-green" : ""}`}>
                        {account.status === "available" ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(account)}>
                          <Pencil size={12} />
                          Düzenle
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggle(account)}>
                          {account.status === "retired" ? "Aktifleştir" : "Pasife al"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "#dc2626" }}
                          onClick={() => setDeleting(account)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Hesabı düzenle" : "Yeni hesap ekle"}
        description="Platform, koruma yöntemi ve (varsa) mail kutusunu seçin. Kaydetmeden önce kodu test edebilirsiniz."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform">
              <select
                value={form.platform}
                onChange={(event) => onPlatformChange(event.target.value)}
                className="select"
              >
                {PLATFORM_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {PLATFORM_PRESETS.filter((item) => item.group === group).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            {form.platform === "custom" ? (
              <Field label="Platform adı">
                <input
                  name="platformLabel"
                  value={form.platformLabel}
                  onChange={(event) => patch({ platformLabel: event.target.value })}
                  className="input"
                  placeholder="Örn. Disney+"
                  required
                />
              </Field>
            ) : (
              <Field label={isSteam ? "Steam kullanıcı adı" : "Kullanıcı adı / e-posta"}>
                <input
                  name="username"
                  value={form.username}
                  onChange={(event) => patch({ username: event.target.value })}
                  className="input"
                  required={isSteam}
                  placeholder={isSteam ? "steam_kullanici" : "kullanıcı adı"}
                />
              </Field>
            )}
          </div>

          {form.platform === "custom" ? (
            <Field label="Kullanıcı adı">
              <input
                name="username"
                value={form.username}
                onChange={(event) => patch({ username: event.target.value })}
                className="input"
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={isSteam ? "Hesaba bağlı e-posta (opsiyonel)" : "E-posta"}
              hint="Kullanıcı adı veya e-postadan en az biri zorunludur."
            >
              <input
                name="email"
                value={form.email}
                onChange={(event) => patch({ email: event.target.value })}
                className="input"
                type="email"
              />
            </Field>
            <Field label="Şifre">
              <input
                name="password"
                value={form.password}
                onChange={(event) => patch({ password: event.target.value })}
                className="input mono"
                required
                autoComplete="off"
              />
            </Field>
          </div>

          <Field
            label="Bağlı ürünler"
            hint="Opsiyonel. Hesabın hangi ürünlerle teslim edileceğini seçin (Steam oyunları, ChatGPT Plus vb.)."
          >
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 hairline scroll-thin">
              {games.length === 0 ? (
                <p className="px-1 py-2 text-[11.5px] muted">
                  Önce Ürünler sekmesinden ürün ekleyin.
                </p>
              ) : null}
              {games.map((game) => {
                const checked = form.linkedGameIds.includes(game.id);
                return (
                  <label
                    key={game.id}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:opacity-80"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        patch({
                          linkedGameIds: checked
                            ? form.linkedGameIds.filter((id) => id !== game.id)
                            : [...form.linkedGameIds, game.id],
                        })
                      }
                    />
                    {game.title}
                  </label>
                );
              })}
            </div>
          </Field>

          <Field label="Koruma türü">
            <select
              value={form.guardType}
              onChange={(event) => patch({ guardType: event.target.value })}
              className="select"
            >
              {guardOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="-mt-2 text-[11px] muted">
            {GUARD_OPTIONS.find((option) => option.id === form.guardType)?.hint}
          </p>

          {guardHasSteam(form.guardType) ? (
            <Field
              label="Steam Guard Shared Secret (base64)"
              hint={
                editing?.hasSteamSecret
                  ? "Mevcut secret kayıtlı. Değiştirmek istemiyorsanız boş bırakın."
                  : "Steam Desktop Authenticator'daki shared_secret. Secret tarayıcıya geri dönmez."
              }
            >
              <input
                name="steamSecret"
                value={form.steamSecret}
                onChange={(event) => patch({ steamSecret: event.target.value })}
                className="input mono text-[12px]"
                placeholder="base64 shared_secret"
              />
            </Field>
          ) : null}

          {guardHasTotp(form.guardType) ? (
            <Field
              label="2FA Secret Key (base32)"
              hint={
                editing?.hasTotpSecret
                  ? "Mevcut secret kayıtlı. Değiştirmek istemiyorsanız boş bırakın."
                  : "Google Authenticator uyumlu base32 secret."
              }
            >
              <input
                name="totpSecret"
                value={form.totpSecret}
                onChange={(event) => patch({ totpSecret: event.target.value })}
                className="input mono text-[12px] uppercase"
                placeholder="JBSWY3DPEHPK3PXP"
              />
            </Field>
          ) : null}

          {guardHasEmail(form.guardType) ? (
            <div className="rounded-xl border p-3 hairline">
              <div className="flex items-center gap-2">
                <Mail size={14} />
                <p className="text-[12.5px] font-semibold">E-posta doğrulama (IMAP)</p>
              </div>
              <p className="mt-1 text-[11px] muted">
                Steam Guard e-postası veya servis doğrulama kodları bağlı mailbox üzerinden okunur.
                Kod, yalnızca gönderen filtresiyle eşleşen en yeni mailden alınır.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Sağlayıcı">
                  <select
                    value={form.mailProvider}
                    onChange={(event) => onMailProvider(event.target.value)}
                    className="select"
                  >
                    {MAIL_PRESETS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Mail adresi">
                  <input
                    name="mailEmail"
                    value={form.mailEmail}
                    onChange={(event) => patch({ mailEmail: event.target.value })}
                    className="input"
                    type="email"
                    placeholder="hesap@ornek.com"
                  />
                </Field>
                <Field label="Uygulama şifresi" hint="Gmail için uygulama şifresi gerekir.">
                  <input
                    name="mailPassword"
                    value={form.mailPassword}
                    onChange={(event) => patch({ mailPassword: event.target.value })}
                    className="input mono"
                    autoComplete="off"
                    placeholder={editing?.mailPassword ? "kayıtlı (boş bırakılabilir)" : ""}
                  />
                </Field>
                <Field label="Gönderen filtresi" hint="Örn. steam, noreply, support.">
                  <input
                    name="mailSenderFilter"
                    value={form.mailSenderFilter}
                    onChange={(event) => patch({ mailSenderFilter: event.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="IMAP sunucusu">
                  <input
                    name="mailHost"
                    value={form.mailHost}
                    onChange={(event) => patch({ mailHost: event.target.value })}
                    className="input mono text-[12px]"
                    placeholder="imap.gmail.com"
                  />
                </Field>
                <Field label="Port">
                  <input
                    name="mailPort"
                    value={form.mailPort}
                    onChange={(event) => patch({ mailPort: event.target.value })}
                    className="input mono text-[12px]"
                    placeholder="993"
                    inputMode="numeric"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 hairline">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onTest}
              disabled={testing || form.guardType === "none"}
            >
              {testing ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              Kodu test et
            </button>
            <p className="text-[11px] muted">
              Kaydetmeden önce üretilen kodu görün. Mail kodları IMAP üzerinden canlı okunur.
            </p>
          </div>
          {testResults ? (
            <div className="rounded-lg border p-3 hairline">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">
                Üretilen kodlar
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {testResults.map((item) => (
                  <div key={item.label} className="rounded-lg border px-3 py-2 hairline">
                    <p className="text-[10.5px] muted">{item.label}</p>
                    <p className="mono mt-1 text-[18px] font-semibold tracking-[0.08em]">{item.code}</p>
                    {item.secondsRemaining > 0 ? (
                      <p className="mt-0.5 text-[10.5px] muted">
                        {remainingShort(new Date(now + item.secondsRemaining * 1000))} geçerli
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10.5px] muted">E-postadan alındı</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Field label="Ek notlar (Markdown destekli)" hint="Müşteri bu notu teslimat ekranında görür.">
            <textarea
              name="notes"
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              className="textarea"
              rows={4}
              placeholder={"Lütfen oyuna girince **Çevrimdışı (Offline)** moda alın.\n\n- Steam > Arkadaşlar > Çevrimdışı"}
            />
          </Field>

          <ErrorLine message={error} />
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="flex items-center gap-1.5 text-[11px] muted">
              <Fingerprint size={12} />
              Kodlar sunucuda üretilir
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                Vazgeç
              </button>
              <button type="submit" className="btn btn-dark" disabled={pending}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? "Güncelle" : "Hesabı ekle"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Hesabı sil"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>
              Vazgeç
            </button>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              Kalıcı olarak sil
            </button>
          </>
        }
      >
        <p className="text-[13px]">
          <strong>{deleting?.username || deleting?.email}</strong> hesabını silmek istediğinize emin
          misiniz? Paylaşımlı teslimatlar hesabı kullanmaya devam edemez.
        </p>
      </Modal>
    </div>
  );
}
