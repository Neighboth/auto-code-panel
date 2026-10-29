"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Boxes,
  CloudDownload,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { deleteAccount, deleteGame, saveAccount, saveGame, setAccountStatus, steamLookup, syncSteamNow } from "@/app/actions/store-admin";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { PLATFORM_PRESETS } from "@/lib/fonts";
import { formatDateTime, formatMoney, convertPrice } from "@/lib/format";

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
  notes: string;
  status: string;
};

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md px-2.5 py-1.5 text-[11.5px]" style={{ background: "#fef2f2", color: "#b91c1c" }}>
      {message}
    </p>
  );
}

/* ------------------------------- Games ------------------------------- */

export function GameManager({ slug, games }: { slug: string; games: AdminGame[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminGame | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminGame | null>(null);
  const [form, setForm] = useState({
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
  });

  function openCreate() {
    setEditing(null);
    setForm({
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
    });
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

  function onCurrencyChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    setForm((current) => ({
      ...current,
      currency: next,
      originalPrice: current.originalPrice
        ? (convertPrice(current.originalPrice, current.originalCurrency, next) ?? current.originalPrice)
        : current.originalPrice,
      originalCurrency: next,
      ourPrice: current.ourPrice ? (convertPrice(current.ourPrice, current.currency, next) ?? current.ourPrice) : current.ourPrice,
    }));
  }

  async function onSteamLookup() {
    if (!form.steamUrl) {
      setError("Önce Steam mağaza linkini girin.");
      return;
    }
    setLookupPending(true);
    setError(null);
    const result = await steamLookup(form.steamUrl);
    setLookupPending(false);
    if (!result.ok || !result.data) {
      setError(result.message ?? "Steam bilgisi alınamadı.");
      return;
    }
    setForm((current) => {
      const selectedCurrency = current.currency || "TRY";
      return {
        ...current,
        title: result.data!.title || current.title,
        description: current.description || result.data!.shortDescription,
        coverImage: result.data!.headerImage || current.coverImage,
        originalPrice:
          result.data!.originalPrice !== null
            ? (convertPrice(result.data!.originalPrice, result.data!.currency || "USD", selectedCurrency) ?? current.originalPrice)
            : current.originalPrice,
        originalCurrency: selectedCurrency,
      };
    });
    toast.success("Steam bilgileri dolduruldu");
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
          <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.025em]">Oyunlar & ürünler</h1>
          <p className="mt-1 text-[12.5px] muted">
            {games.length} ürün · Steam linki girildiğinde başlık, kapak ve resmi fiyat otomatik çekilir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onSync} disabled={pending}>
            {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Steam senkronize et
          </button>
          <button type="button" className="btn btn-dark btn-sm" onClick={openCreate}>
            <Plus size={13} />
            Yeni ürün
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[820px]">
            <thead>
              <tr>
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
                  <td colSpan={6} className="py-12 text-center">
                    <Boxes size={22} className="mx-auto muted" />
                    <p className="mt-2 text-[12.5px] font-medium">Henüz ürün yok</p>
                    <p className="mt-1 text-[11.5px] muted">Steam linki yapıştırarak saniyeler içinde ekleyin.</p>
                  </td>
                </tr>
              ) : null}
              {games.map((game) => (
                <tr key={game.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="h-9 w-16 shrink-0 overflow-hidden rounded-md" style={{ background: "var(--bg)" }}>
                        {game.coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={game.coverImage} alt={game.title} className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium">{game.title}</p>
                        <p className="truncate text-[10.5px] muted">
                          {game.steamAppId ? `AppID ${game.steamAppId}` : "Manuel ürün"}
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
        description="Steam linki girip 'Steam'den çek' butonunu kullanarak alanları otomatik doldurabilirsiniz."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <Field label="Steam Mağaza Linki (opsiyonel)">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                name="steamUrl"
                value={form.steamUrl}
                onChange={(event) => setForm((current) => ({ ...current, steamUrl: event.target.value }))}
                placeholder="https://store.steampowered.com/app/1091500/cyberpunk_2077/"
                className="input mono text-[12px]"
              />
              <button type="button" className="btn btn-outline shrink-0" onClick={onSteamLookup} disabled={lookupPending}>
                {lookupPending ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />}
Steam&apos;den çek
              </button>
            </div>
          </Field>
          <Field label="Başlık">
            <input
              name="title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="input"
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
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Satış İlan Linki" hint="Itemsatış vb. dış ilan adresi.">
              <input
                name="salesUrl"
                value={form.salesUrl}
                onChange={(event) => setForm((current) => ({ ...current, salesUrl: event.target.value }))}
                className="input"
                placeholder="https://www.itemsatis.com/..."
              />
            </Field>
            <Field label="Kapak Görseli URL">
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
            <Field label="Orijinal Fiyat">
              <input
                name="originalPrice"
                value={form.originalPrice}
                onChange={(event) => setForm((current) => ({ ...current, originalPrice: event.target.value }))}
                className="input"
                placeholder="1999.00"
              />
            </Field>
            <Field label="Bizim Fiyatımız">
              <input
                name="ourPrice"
                value={form.ourPrice}
                onChange={(event) => setForm((current) => ({ ...current, ourPrice: event.target.value }))}
                className="input"
                placeholder="349.90"
                required
              />
            </Field>
            <Field label="Para Birimi">
              <select
                name="currency"
                value={form.currency}
                onChange={onCurrencyChange}
                className="select"
              >
                <option value="TRY">TRY ₺</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
              </select>
            </Field>
          </div>
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
          <strong>{deleting?.title}</strong> ürününü silmek istediğinize emin misiniz? Bağlı kodlar varsa
          silme işlemi engellenir.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------ Accounts ----------------------------- */

const emptyAccount = {
  platform: "steam",
  platformLabel: "",
  username: "",
  email: "",
  password: "",
  productLabel: "",
  guardType: "steam_guard",
  steamSecret: "",
  totpSecret: "",
  mailEmail: "",
  mailPassword: "",
  notes: "",
  linkedGameIds: [] as number[],
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
  const [form, setForm] = useState(emptyAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminAccount | null>(null);

  const isSteam = form.platform === "steam";

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyAccount });
    setError(null);
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
      mailEmail: account.mailEmail ?? "",
      mailPassword: account.mailPassword ?? "",
      notes: account.notes,
      linkedGameIds: account.linkedGameIds,
    });
    setError(null);
    setOpen(true);
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
            {quota.used} / {quota.max ?? "sınırsız"} hesap kullanılıyor. Secret anahtarları şifreli
            saklanır ve panele gönderilmez.
          </p>
        </div>
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

      {quota.reached ? (
        <div className="rounded-lg border px-3.5 py-2.5 text-[12px]" style={{ borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
          Bayilik paketinizin hesap limiti doldu. Yeni hesap eklemek için paketinizi yükseltin.
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th>Platform / hesap</th>
                <th>Bağlı oyun</th>
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
                    <p className="mt-1 text-[11.5px] muted">Steam veya diğer platform hesaplarını ekleyin.</p>
                  </td>
                </tr>
              ) : null}
              {accounts.map((account) => {
                const linked = games.filter((game) => account.linkedGameIds.includes(game.id));
                return (
                  <tr key={account.id}>
                    <td>
                      <p className="text-[12.5px] font-medium">
                        {account.username || account.email || "—"}
                      </p>
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
                        {account.guardType === "steam_guard"
                          ? "Steam Guard"
                          : account.guardType === "totp"
                            ? "TOTP 2FA"
                            : "2FA yok"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          account.status === "available" ? "badge-green" : account.status === "assigned" ? "badge-amber" : ""
                        }`}
                      >
                        {account.status === "available" ? "Müsait" : account.status === "assigned" ? "Teslim edildi" : "Pasif"}
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
        description="Platforma göre form alanları dinamik olarak değişir."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform">
              <select
                value={form.platform}
                onChange={(event) => {
                  const platform = event.target.value;
                  setForm((current) => ({
                    ...current,
                    platform,
                    guardType: platform === "steam" ? "steam_guard" : "totp",
                  }));
                }}
                className="select"
              >
                {PLATFORM_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.platform === "custom" ? (
              <Field label="Platform Adı">
                <input
                  name="platformLabel"
                  value={form.platformLabel}
                  onChange={(event) => setForm((current) => ({ ...current, platformLabel: event.target.value }))}
                  className="input"
                  placeholder="Örn. Disney+"
                  required
                />
              </Field>
            ) : (
              <Field label={isSteam ? "Steam Kullanıcı Adı" : "Kullanıcı Adı / E-posta"}>
                <input
                  name="username"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  className="input"
                  required={isSteam}
                  placeholder={isSteam ? "steam_kullanici" : "kullanıcı adı veya e-posta"}
                />
              </Field>
            )}
          </div>

          {form.platform === "custom" ? (
            <Field label="Kullanıcı Adı">
              <input
                name="username"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                className="input"
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {!isSteam ? (
              <Field label="E-posta" hint="Kullanıcı adı veya e-postadan en az biri zorunludur.">
                <input
                  name="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="input"
                  type="email"
                />
              </Field>
            ) : null}
            <Field label="Şifre">
              <input
                name="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                className="input mono"
                required
                autoComplete="off"
              />
            </Field>
          </div>

          {isSteam ? (
            <Field label="Bağlı Oyunlar" hint="Bu Steam hesabında bulunan oyunları seçin (çoklu seçim).">
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 hairline scroll-thin">
                {games.length === 0 ? (
                  <p className="px-1 py-2 text-[11.5px] muted">Önce Oyunlar sekmesinden ürün ekleyin.</p>
                ) : null}
                {games.map((game) => {
                  const checked = form.linkedGameIds.includes(game.id);
                  return (
                    <label key={game.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:opacity-80">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            linkedGameIds: checked
                              ? current.linkedGameIds.filter((id) => id !== game.id)
                              : [...current.linkedGameIds, game.id],
                          }))
                        }
                      />
                      {game.title}
                    </label>
                  );
                })}
              </div>
            </Field>
          ) : (
            <Field label="Bağlı Ürün / Kategori">
              <input
                name="productLabel"
                value={form.productLabel}
                onChange={(event) => setForm((current) => ({ ...current, productLabel: event.target.value }))}
                className="input"
                placeholder="Örn. ChatGPT Plus"
              />
            </Field>
          )}

          <Field label={isSteam ? "2FA / Koruma Türü" : "2FA Durumu"}>
            <select
              name="guardType"
              value={form.guardType}
              onChange={(event) => setForm((current) => ({ ...current, guardType: event.target.value }))}
              className="select"
            >
              {isSteam ? (
                <>
                  <option value="steam_guard">Steam Guard Aktif</option>
                  <option value="none">2FA Yok (Korumasız)</option>
                </>
              ) : (
                <>
                  <option value="totp">Standart 2FA (TOTP)</option>
                  <option value="none">2FA Yok</option>
                </>
              )}
            </select>
          </Field>

          {isSteam && form.guardType === "steam_guard" ? (
            <Field
              label="Steam Guard Shared Secret (base64)"
              hint={
                editing?.hasSteamSecret
                  ? "Mevcut secret kayıtlı. Değiştirmek istemiyorsanız boş bırakın."
                  : "Steam Desktop Authenticator'daki shared_secret değeri. Secret hiçbir zaman tarayıcıya geri dönmez."
              }
            >
              <input
                name="steamSecret"
                value={form.steamSecret}
                onChange={(event) => setForm((current) => ({ ...current, steamSecret: event.target.value }))}
                className="input mono text-[12px]"
                placeholder="base64 shared_secret"
                required={!editing?.hasSteamSecret}
              />
            </Field>
          ) : null}

          {!isSteam && form.guardType === "totp" ? (
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
                onChange={(event) => setForm((current) => ({ ...current, totpSecret: event.target.value }))}
                className="input mono text-[12px] uppercase"
                placeholder="JBSWY3DPEHPK3PXP"
                required={!editing?.hasTotpSecret}
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bağlı Mail (opsiyonel)">
              <input
                name="mailEmail"
                value={form.mailEmail}
                onChange={(event) => setForm((current) => ({ ...current, mailEmail: event.target.value }))}
                className="input"
                type="email"
                placeholder="mail@ornek.com"
              />
            </Field>
            <Field label="Mail Şifresi (opsiyonel)">
              <input
                name="mailPassword"
                value={form.mailPassword}
                onChange={(event) => setForm((current) => ({ ...current, mailPassword: event.target.value }))}
                className="input mono"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="Ek Notlar (Markdown destekli)" hint="Liste, kalın metin ve satır sonları desteklenir.">
            <textarea
              name="notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="textarea"
              rows={4}
              placeholder={"Lütfen oyuna girince **Çevrimdışı (Offline)** moda alın.\n\n- Steam > Arkadaşlar > Çevrimdışı"}
            />
          </Field>

          <ErrorLine message={error} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Vazgeç
            </button>
            <button type="submit" className="btn btn-dark" disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing ? "Güncelle" : "Hesabı ekle"}
            </button>
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
          <strong>{deleting?.username || deleting?.email}</strong> hesabını silmek istediğinize emin misiniz?
          Aktif teslimatı olan hesaplar silinemez.
        </p>
      </Modal>
    </div>
  );
}
