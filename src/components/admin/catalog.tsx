"use client";
import { useT } from "@/components/i18n-provider";

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
  const t = useT();
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
      setError(t("x.once-steam-magaza-linkini-girin"));
      return;
    }
    setLookupPending(true);
    setError(null);
    const result = await steamLookup(form.steamUrl, form.currency);
    setLookupPending(false);
    if (!result.ok || !result.data) {
      setError(result.message ?? t("x.steam-bilgisi-alnamad"));
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
      setError(result.message ?? t("x.kaydedilemedi"));
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

  async function onBulkPrice() {
    if (selected.length === 0) return;
    const result = await bulkUpdateProductPrices(slug, selected, bulkMode, Number(bulkValue.replace(",", ".")));
    if (!result.ok) {
      toast.error(result.message ?? t("x.fiyatlar-guncellenemedi"));
      return;
    }
    toast.success(result.message ?? t("x.fiyatlar-guncellendi"));
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
      toast.error(result.message ?? t("x.senkronizasyon-basarsz"));
      return;
    }
    toast.success(result.message ?? "Senkronize edildi");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.vitrin-yonetimi")}</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">{" "}{t("x.urunler-oyunlar")}</h1>
          <p className="mt-1 text-[12.5px] muted">
            {t("x.count-urun-oyun-abonelik-veya-dijital-urun-ekleyin-steam", { count: games.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onSync} disabled={pending}>
            {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Steam senkronize et
          </button>
          <CsvImportButton kind="products" action={(csv) => importProductsCsv(slug, csv)} />
          <button type="button" className="btn btn-dark btn-sm" onClick={openCreate}>
            <Plus size={13} />{t("x.yeni-urun")}</button>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--surface)] px-3 py-2.5 hairline">
          <span className="text-[12px] font-medium">{t("x.count-urun-secildi", { count: selected.length })}</span>
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
                    aria-label={t("x.tum-urunleri-sec")}
                    checked={games.length > 0 && selected.length === games.length}
                    onChange={(event) => setSelected(event.target.checked ? games.map((game) => game.id) : [])}
                  />
                </th>
                <th>{t("x.urun")}</th>
                <th>Orijinal</th>
                <th>{t("x.bizim-fiyat")}</th>
                <th>Auto-sync</th>
                <th>{t("x.son-senkron")}</th>
                <th className="text-right">{t("x.islem")}</th>
              </tr>
            </thead>
            <tbody>
              {games.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Boxes size={22} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">{" "}{t("x.henuz-urun-yok")}</p>
                    <p className="mt-1 text-[11.5px] muted">{t("x.steam-linki-veya-manuel-giris-ile-ilk-urununuzu-ekleyin")}</p>
                  </td>
                </tr>
              ) : null}
              {games.map((game) => (
                <tr key={game.id}>
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label={t("x.name-sec", { name: game.title })}
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
                          {game.steamAppId ? `Steam AppID ${game.steamAppId}` : t("x.manuel-urun")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-[12px] tabular-nums">{formatMoney(game.originalPrice, game.currency)}</td>
                  <td className="text-[12px] font-medium tabular-nums">{formatMoney(game.ourPrice, game.currency)}</td>
                  <td>
                    <span className={`badge ${game.autoSync ? "badge-blue" : ""}`}>
                      {game.autoSync ? t("x.ack") : t("x.kapal")}
                    </span>
                  </td>
                  <td className="text-[11px] muted">{game.lastSyncedAt ? formatDateTime(game.lastSyncedAt) : "—"}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(game)}>
                        <Pencil size={12} />{t("x.duzenle")}</button>
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
        title={editing ? t("x.urunu-duzenle") : t("x.yeni-urun-ekle")}
        description={t("x.oyun-abonelik-veya-dijital-urun-steam-linki-opsiyoneldir")}
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <Field label={t("x.steam-magaza-linki-opsiyonel")}>
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
                {t("x.steam-den-cek")}
              </button>
            </div>
          </Field>
          <Field label={t("x.urun-ad")}>
            <input
              name="title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="input"
              placeholder={t("x.orn-cyberpunk-2077-veya-chatgpt-plus")}
              required
            />
          </Field>
          <Field label={t("x.acklama")}>
            <textarea
              name="description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="textarea"
              rows={3}
              placeholder={t("x.urun-hakknda-ksa-bilgi-teslim-sekli-kullanm-notlar")}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("x.sats-ilan-linki")} hint={t("x.itemsats-vb-ds-ilan-adresi-opsiyonel")}>
              <input
                name="salesUrl"
                value={form.salesUrl}
                onChange={(event) => setForm((current) => ({ ...current, salesUrl: event.target.value }))}
                className="input"
                placeholder="https://www.itemsatis.com/..."
              />
            </Field>
            <Field label={t("x.kapak-gorseli-url")}>
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
            <Field label={t("x.orijinal-fiyat")}>
              <input
                name="originalPrice"
                value={form.originalPrice}
                onChange={(event) => setForm((current) => ({ ...current, originalPrice: event.target.value }))}
                className="input"
                placeholder="1999.00"
                inputMode="decimal"
              />
            </Field>
            <Field label={t("x.bizim-fiyatmz")}>
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
          <p className="text-[11px] muted">{t("x.para-birimini-degistirdiginizde-fiyat-kutular-guncel-kur")}</p>
          <label className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] hairline">
            <input
              type="checkbox"
              checked={form.autoSync}
              onChange={(event) => setForm((current) => ({ ...current, autoSync: event.target.checked }))}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Otomatik senkronizasyon (Auto-Sync)</span>
              <span className="mt-0.5 block text-[11px] muted">{t("x.ackken-cron-gorevi-steam-den-guncel-fiyat-baslk-ve-kapag")}</span>
            </span>
          </label>
          <ErrorLine message={error} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t("x.vazgec")}</button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? t("x.guncelle") : t("x.urunu-kaydet")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("x.urunu-sil")}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>{t("x.vazgec")}</button>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              {t("x.kalc-olarak-sil")}
            </button>
          </>
        }
      >
        <p className="text-[13px]">
          <strong>{deleting?.title}</strong>{t("x.urununu-silmek-istediginize-emin-misiniz-bagl-kodlar-var")}</p>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={t("x.toplu-fiyat-guncelle")}
        description={t("x.count-urun-secildi", { count: selected.length })}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setBulkOpen(false)}>{t("x.vazgec")}</button>
            <button type="button" className="btn btn-dark" onClick={onBulkPrice}>
              Uygula
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("x.islem-turu")} htmlFor="bulkMode">
            <select
              id="bulkMode"
              className="select"
              value={bulkMode}
              onChange={(event) => setBulkMode(event.target.value as "percent" | "amount")}
            >
              <option value="percent">{" "}{t("x.yuzde-olarak-degistir")}</option>
              <option value="amount">{" "}{t("x.tutar-kadar-degistir")}</option>
            </select>
          </Field>
          <Field
            label={bulkMode === "percent" ? t("x.yuzde") : "Tutar"}
            hint={
              bulkMode === "percent"
                ? t("x.negatif-deger-indirim-uygular-ornek-15-fiyatlar-15-duser")
                : t("x.negatif-deger-indirim-uygular-ornek-50-her-fiyattan-50-b")
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
          <p className="text-[11.5px] leading-relaxed muted">{t("x.fiyatlar-urunun-kendi-para-biriminde-guncellenir-sfr-vey")}</p>
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
  const t = useT();
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
      setError(result.message ?? t("x.kod-uretilemedi"));
      return;
    }
    setTestResults(result.data.results);
    toast.success(t("x.kod-uretildi-kontrol-edebilirsiniz"));
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
      setError(result.message ?? t("x.kaydedilemedi"));
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
      toast.error(result.message ?? t("x.silinemedi"));
      return;
    }
    toast.success(result.message ?? t("x.silindi"));
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
      toast.error(result.message ?? t("x.guncellenemedi"));
      return;
    }
    toast.success(result.message ?? t("x.guncellendi"));
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Envanter</p>
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Hesaplar & 2FA / Guard</h1>
          <p className="mt-1 text-[12.5px] muted">
            {t("x.used-max-hesap", { used: quota.used, max: quota.max ?? t("x.snrsz") })} · {t("x.paylasml-hesaplar-suresiz-teslim-edilir")}
            {t("x.secret-anahtarlar-sifreli-saklanr")}
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
        <div className="note note-warn">{t("x.bayilik-paketinizin-hesap-limiti-doldu-yeni-hesap-ekleme")}</div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th>{t("x.platform-hesap")}</th>
                <th>{" "}{t("x.bagl-urun")}</th>
                <th>Koruma</th>
                <th>{t("x.durum")}</th>
                <th className="text-right">{t("x.islem")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Sparkles size={20} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">{" "}{t("x.envanter-bos")}</p>
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
                        {t(GUARD_OPTIONS.find((option) => option.id === account.guardType)?.label ?? "x.2fa-yok")}
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
                          <Pencil size={12} />{t("x.duzenle")}</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggle(account)}>
                          {account.status === "retired" ? t("x.aktiflestir") : "Pasife al"}
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
        title={editing ? t("x.hesab-duzenle") : "Yeni hesap ekle"}
        description={t("x.platform-koruma-yontemi-ve-varsa-mail-kutusunu-secin-kay")}
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
              <Field label={t("x.platform-ad")}>
                <input
                  name="platformLabel"
                  value={form.platformLabel}
                  onChange={(event) => patch({ platformLabel: event.target.value })}
                  className="input"
                  placeholder={t("x.orn-disney")}
                  required
                />
              </Field>
            ) : (
              <Field label={isSteam ? t("x.steam-kullanc-ad") : t("x.kullanc-ad-e-posta")}>
                <input
                  name="username"
                  value={form.username}
                  onChange={(event) => patch({ username: event.target.value })}
                  className="input"
                  required={isSteam}
                  placeholder={isSteam ? "steam_kullanici" : t("x.kullanc-ad")}
                />
              </Field>
            )}
          </div>

          {form.platform === "custom" ? (
            <Field label={t("x.kullanc-ad-2")}>
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
              label={isSteam ? t("x.hesaba-bagl-e-posta-opsiyonel") : "E-posta"}
              hint={t("x.kullanc-ad-veya-e-postadan-en-az-biri-zorunludur")}
            >
              <input
                name="email"
                value={form.email}
                onChange={(event) => patch({ email: event.target.value })}
                className="input"
                type="email"
              />
            </Field>
            <Field label={t("x.sifre")}>
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
            label={t("x.bagl-urunler")}
            hint={t("x.opsiyonel-hesabn-hangi-urunlerle-teslim-edilecegini-seci")}
          >
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 hairline scroll-thin">
              {games.length === 0 ? (
                <p className="px-1 py-2 text-[11.5px] muted">{t("x.once-urunler-sekmesinden-urun-ekleyin")}</p>
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

          <Field label={t("x.koruma-turu")}>
            <select
              value={form.guardType}
              onChange={(event) => patch({ guardType: event.target.value })}
              className="select"
            >
              {guardOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </Field>
          <p className="-mt-2 text-[11px] muted">
            {t(GUARD_OPTIONS.find((option) => option.id === form.guardType)?.hint ?? "")}
          </p>

          {guardHasSteam(form.guardType) ? (
            <Field
              label="Steam Guard Shared Secret (base64)"
              hint={
                editing?.hasSteamSecret
                  ? t("x.mevcut-secret-kaytl-degistirmek-istemiyorsanz-bos-brakn")
                  : t("x.steam-desktop-authenticator-daki-shared-secret-secret-ta")
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
                  ? t("x.mevcut-secret-kaytl-degistirmek-istemiyorsanz-bos-brakn")
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
                <p className="text-[12.5px] font-semibold">{" "}{t("x.e-posta-dogrulama-imap")}</p>
              </div>
              <p className="mt-1 text-[11px] muted">{t("x.steam-guard-e-postas-veya-servis-dogrulama-kodlar-bagl-m")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t("x.saglayc")}>
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
                <Field label={t("x.mail-adresi")}>
                  <input
                    name="mailEmail"
                    value={form.mailEmail}
                    onChange={(event) => patch({ mailEmail: event.target.value })}
                    className="input"
                    type="email"
                    placeholder="hesap@ornek.com"
                  />
                </Field>
                <Field label={t("x.uygulama-sifresi")} hint={t("x.gmail-icin-uygulama-sifresi-gerekir")}>
                  <input
                    name="mailPassword"
                    value={form.mailPassword}
                    onChange={(event) => patch({ mailPassword: event.target.value })}
                    className="input mono"
                    autoComplete="off"
                    placeholder={editing?.mailPassword ? t("x.kaytl-bos-braklabilir") : ""}
                  />
                </Field>
                <Field label={t("x.gonderen-filtresi")} hint={t("x.orn-steam-noreply-support")}>
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
            <p className="text-[11px] muted">{t("x.kaydetmeden-once-uretilen-kodu-gorun-mail-kodlar-imap-uz")}</p>
          </div>
          {testResults ? (
            <div className="rounded-lg border p-3 hairline">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">{t("x.uretilen-kodlar")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {testResults.map((item) => (
                  <div key={item.label} className="rounded-lg border px-3 py-2 hairline">
                    <p className="text-[10.5px] muted">{item.label}</p>
                    <p className="mono mt-1 text-[18px] font-semibold tracking-[0.08em]">{item.code}</p>
                    {item.secondsRemaining > 0 ? (
                      <p className="mt-0.5 text-[10.5px] muted">
                        {t("x.gecerli", { time: remainingShort(new Date(now + item.secondsRemaining * 1000)) })}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10.5px] muted">{" "}{t("x.e-postadan-alnd")}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Field label="Ek notlar (Markdown destekli)" hint={t("x.musteri-bu-notu-teslimat-ekrannda-gorur")}>
            <textarea
              name="notes"
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              className="textarea"
              rows={4}
              placeholder={t("x.lutfen-oyuna-girince-cevrimds-offline-moda-aln-n-n-steam")}
            />
          </Field>

          <ErrorLine message={error} />
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="flex items-center gap-1.5 text-[11px] muted">
              <Fingerprint size={12} />{t("x.kodlar-sunucuda-uretilir")}</span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t("x.vazgec")}</button>
              <button type="submit" className="btn btn-dark" disabled={pending}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? t("x.guncelle") : t("x.hesab-ekle")}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("x.hesab-sil")}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)}>{t("x.vazgec")}</button>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
              {t("x.kalc-olarak-sil")}
            </button>
          </>
        }
      >
        <p className="text-[13px]">
          <strong>{deleting?.username || deleting?.email}</strong>{t("x.hesabn-silmek-istediginize-emin-misiniz-paylasml-teslima")}</p>
      </Modal>
    </div>
  );
}
