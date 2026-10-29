"use client";
import { useT } from "@/components/i18n-provider";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Globe2, Loader2, Plus, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { saveStoreCredentials, saveStoreDomain, saveStoreSettings, verifyStoreDomain } from "@/app/actions/store-admin";
import { CopyButton } from "@/components/copy-button";
import { Field } from "@/components/ui";
import { FONT_OPTIONS, googleFontHref } from "@/lib/fonts";

export type StoreBranding = {
  slug: string;
  title: string;
  subtitle: string;
  announcement: string;
  footerText: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  contactLinks: { label: string; url: string }[];
};

export function StoreSettingsForm({ store }: { store: StoreBranding }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(store.slug);
  const [logoUrl, setLogoUrl] = useState(store.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(store.faviconUrl);
  const [primaryColor, setPrimaryColor] = useState(store.primaryColor);
  const [accentColor, setAccentColor] = useState(store.accentColor);
  const [fontFamily, setFontFamily] = useState(store.fontFamily);
  const [fontSearch, setFontSearch] = useState("");
  const [fontOpen, setFontOpen] = useState(false);
  const [contacts, setContacts] = useState(store.contactLinks.length ? store.contactLinks : [{ label: "", url: "" }]);

  const filteredFonts = useMemo(() => {
    const term = fontSearch.trim().toLowerCase();
    const list = term ? FONT_OPTIONS.filter((font) => font.family.toLowerCase().includes(term)) : FONT_OPTIONS;
    return list.slice(0, 40);
  }, [fontSearch]);

  useEffect(() => {
    const families = [fontFamily, ...filteredFonts.slice(0, 12).map((font) => font.family)];
    const href = googleFontHref(families);
    if (!href) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.fontPreview = "true";
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [fontFamily, filteredFonts]);

  function onImage(event: ChangeEvent<HTMLInputElement>, target: "logo" | "favicon") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 180_000) {
      toast.error(t("x.gorsel-en-fazla-180-kb-olabilir"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      if (target === "logo") setLogoUrl(value);
      else setFaviconUrl(value);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", store.slug);
    formData.set("newSlug", slug);
    formData.set("logoUrl", logoUrl);
    formData.set("faviconUrl", faviconUrl);
    formData.set("primaryColor", primaryColor);
    formData.set("accentColor", accentColor);
    formData.set("fontFamily", fontFamily);
    formData.set(
      "contactLinks",
      JSON.stringify(contacts.filter((contact) => contact.label.trim() && contact.url.trim())),
    );
    const result = await saveStoreSettings(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.kaydedilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.ayarlar-kaydedildi"));
    if (result.data?.slug && result.data.slug !== store.slug) {
      // Always use the prefixed path: on a custom domain the server's domain cache
      // may still point at the previous slug for a few seconds.
      router.push(`/${result.data.slug}/admin/ayarlar`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="card p-5">
        <h2 className="text-[14px] font-semibold">{" "}{t("x.magaza-kimligi")}</h2>
        <p className="mt-0.5 text-[11.5px] muted">{" "}{t("x.vitrinde-gorunen-baslk-acklama-ve-duyuru-metinleri")}</p>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <Field label={t("x.site-baslg-title")}>
            <input name="title" defaultValue={store.title} className="input" required />
          </Field>
          <Field label={t("x.magaza-id-slug")} hint={`Vitrin adresi: /${slug}`}>
            <input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="input mono" required />
          </Field>
        </div>
        <div className="mt-3.5">
          <Field label={t("x.alt-baslk")}>
            <input name="subtitle" defaultValue={store.subtitle} className="input" />
          </Field>
        </div>
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          <Field label={t("x.duyuru-band")} hint={t("x.bos-braklrsa-bant-gizlenir")}>
            <input name="announcement" defaultValue={store.announcement} className="input" />
          </Field>
          <Field label="Footer Metni">
            <input name="footerText" defaultValue={store.footerText} className="input" />
          </Field>
        </div>

        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <div>
            <p className="label">Logo</p>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border hairline">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async" src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] muted">{t("x.yok")}</span>
                )}
              </span>
              <div className="flex-1">
                <label className="btn btn-outline btn-sm cursor-pointer">
                  <Upload size={12} />{t("x.gorsel-yukle")}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => onImage(event, "logo")} />
                </label>
                <input
                  value={logoUrl.startsWith("data:") ? "" : logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  placeholder={t("x.veya-https")}
                  className="input mt-1.5 text-[11.5px]"
                />
              </div>
            </div>
          </div>
          <div>
            <p className="label">Favicon</p>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border hairline">
                {faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async" src={faviconUrl} alt="Favicon" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] muted">{t("x.yok")}</span>
                )}
              </span>
              <div className="flex-1">
                <label className="btn btn-outline btn-sm cursor-pointer">
                  <Upload size={12} />{t("x.gorsel-yukle")}<input type="file" accept="image/png,image/x-icon,image/svg+xml" className="hidden" onChange={(event) => onImage(event, "favicon")} />
                </label>
                <input
                  value={faviconUrl.startsWith("data:") ? "" : faviconUrl}
                  onChange={(event) => setFaviconUrl(event.target.value)}
                  placeholder={t("x.veya-https")}
                  className="input mt-1.5 text-[11.5px]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[14px] font-semibold">Tema ve tipografi</h2>
        <p className="mt-0.5 text-[11.5px] muted">{t("x.renkler-css-degiskenleri-ile-tum-magaza-arayuzune-annda")}</p>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <div>
            <p className="label">Ana Renk (Primary)</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent hairline"
              />
              <input
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="input mono text-[12px]"
              />
            </div>
          </div>
          <div>
            <p className="label">Vurgu Rengi (Accent)</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent hairline"
              />
              <input
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
                className="input mono text-[12px]"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="label">{" "}{t("x.yaz-tipi-google-fonts")}</p>
          <button
            type="button"
            onClick={() => setFontOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left hairline"
          >
            <span className="text-[13px]" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>
              {fontFamily}
            </span>
            <span className="text-[11px] muted">{FONT_OPTIONS.length} font</span>
          </button>
          {fontOpen ? (
            <div className="mt-2 rounded-xl border p-2.5 hairline" style={{ background: "var(--bg)" }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
                <input
                  value={fontSearch}
                  onChange={(event) => setFontSearch(event.target.value)}
                  placeholder={t("x.font-ara")}
                  className="input h-9 pl-8 text-[12px]"
                  autoFocus
                />
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg scroll-thin">
                {filteredFonts.map((font) => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => {
                      setFontFamily(font.family);
                      setFontOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:opacity-70"
                    style={{ background: font.family === fontFamily ? "color-mix(in srgb, var(--fg) 6%, transparent)" : "transparent" }}
                  >
                    <span className="text-[14px]" style={{ fontFamily: `"${font.family}", sans-serif` }}>
                      {font.family}
                    </span>
                    <span className="flex items-center gap-2 text-[10px] muted">
                      {font.category}
                      {font.family === fontFamily ? <Check size={12} /> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-2 rounded-lg border px-3 py-2.5 hairline">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">{" "}{t("x.canl-onizleme")}</p>
            <p className="mt-1 text-[17px] font-semibold" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>{t("x.dijital-hesap-teslimat")}</p>
            <p className="text-[12px] muted" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>{t("x.steam-guard-kodlar-saniyeler-icinde-yenilenir-0123456789")}</p>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">{" "}{t("x.sosyal-medya-iletisim")}</h2>
            <p className="mt-0.5 text-[11.5px] muted">{" "}{t("x.footer-da-en-fazla-6-link-gosterilir")}</p>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setContacts((current) => [...current, { label: "", url: "" }].slice(0, 6))}
            disabled={contacts.length >= 6}
          >
            <Plus size={12} />
            {t("x.link-ekle")}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {contacts.map((contact, index) => (
            <div key={index} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-2">
              <input
                value={contact.label}
                onChange={(event) =>
                  setContacts((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))
                }
                placeholder="Telegram"
                className="input"
              />
              <input
                value={contact.url}
                onChange={(event) =>
                  setContacts((current) => current.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)))
                }
                placeholder="https://t.me/..."
                className="input"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "#dc2626" }}
                onClick={() => setContacts((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <p className="note note-danger text-[12px]">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("x.tum-ayarlar-kaydet")}
        </button>
      </div>
    </form>
  );
}

export function StoreDomainForm({
  slug,
  domain,
  verifiedAt,
  token,
}: {
  slug: string;
  domain: string;
  verifiedAt: string | null;
  token: string;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(domain);
  const [savedDomain, setSavedDomain] = useState(domain);
  const [activeToken, setActiveToken] = useState(token);
  const [verified, setVerified] = useState(Boolean(verifiedAt));
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveDomain, setConfirmRemoveDomain] = useState(false);

  async function save(nextDomain: string) {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("domain", nextDomain);
    const result = await saveStoreDomain(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.alan-ad-kaydedilemedi"));
      return;
    }
    const next = result.data?.domain ?? "";
    const unchanged = next === savedDomain;
    setSavedDomain(next);
    setActiveToken(result.data?.token ?? "");
    setVerified(unchanged && Boolean(verifiedAt));
    setValue(next);
    toast.success(result.message ?? t("x.alan-ad-kaydedildi"));
    router.refresh();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(value);
  }

  async function onVerify() {
    setVerifying(true);
    setError(null);
    const formData = new FormData();
    formData.set("slug", slug);
    const result = await verifyStoreDomain(formData);
    setVerifying(false);
    if (!result.ok) {
      setError(result.message ?? t("x.dogrulanamad"));
      return;
    }
    setVerified(true);
    toast.success(result.message ?? t("x.alan-ad-dogruland"));
    router.refresh();
  }

  async function onRemove() {
    if (!confirmRemoveDomain) {
      setConfirmRemoveDomain(true);
      return;
    }
    setConfirmRemoveDomain(false);
    await save("");
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
            <Globe2 size={16} />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold">{" "}{t("x.ozel-alan-ad")}</h2>
            <p className="mt-0.5 max-w-xl text-[11.5px] leading-relaxed muted">{t("x.opsiyonel-magazanz")}<span className="mono">magazadi.com</span>{t("x.gibi-kendi-alan-adnzla-yaynlayn-bagl-alan-adnda")}<span className="mono">/slug</span>{t("x.oneki-gorunmez")}</p>
          </div>
        </div>
        <span className={`badge ${verified ? "badge-green" : savedDomain ? "badge-amber" : "badge"}`}>
          {verified ? (
            <>
              <ShieldCheck size={10} /> Aktif
            </>
          ) : savedDomain ? (
            t("x.dogrulama-bekliyor")
          ) : (
            t("x.kapal")
          )}
        </span>
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Globe2 size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="input pl-9"
            placeholder="magazadi.com"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-dark" disabled={pending || verifying}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : null}
            {t("x.kaydet")}
          </button>
          {savedDomain ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onVerify}
              disabled={verifying || pending}
            >
              {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {t("x.dns-dogrula")}
            </button>
          ) : null}
          {savedDomain ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onRemove}
              disabled={pending || verifying}
              style={{ color: "#dc2626" }}
              title={t("x.alan-adn-kaldr")}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </form>

      {verified && savedDomain ? (
        <div
          className="mt-3 rounded-lg border px-3 py-2 text-[11.5px]"
        >
          <span className="font-semibold">https://{savedDomain}</span>{t("x.magazanza-bagl-ssl-sertifikas-icin-alan-adn-sunucuya-yon")}</div>
      ) : null}

      {savedDomain && activeToken && !verified ? (
        <div className="mt-3 rounded-lg border p-3 hairline" style={{ background: "var(--bg)" }}>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">{t("x.dns-dogrulama-kaytlar")}</p>
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 hairline">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.06em] muted">{" "}{t("x.txt-kayd")}</p>
                <p className="mono mt-0.5 truncate text-[11px]">_pixguard.{savedDomain}</p>
                <p className="mono mt-0.5 truncate text-[11px]" style={{ color: "var(--fg)" }}>
                  {activeToken}
                </p>
              </div>
              <CopyButton value={activeToken} compact label={t("x.txt-degerini-kopyala")} />
            </div>
            <div className="rounded-md border px-2.5 py-2 hairline">
              <p className="text-[10px] uppercase tracking-[0.06em] muted">{t("x.yonlendirme")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed muted">{t("x.alan-adnn-a-kaydn-sunucunuzun-ip-adresine")}<span className="mono">www</span>{t("x.alt-alan-adn-ise-ayn-adrese-veya")}<span className="mono">{savedDomain}</span>{t("x.cname-ine-yonlendirin-dns-yaylm-5-dakikaya-kadar-surebil")}</p>
            </div>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed muted">{t("x.dogrulama-yalnzca-alan-adnn-sizde-oldugunu-kontrol-eder")}</p>
        </div>
      ) : null}

      {error ? (
        <p className="note note-danger mt-3 text-[12px]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function StoreCredentialsForm({
  slug,
  username,
  email,
}: {
  slug: string;
  username: string;
  email: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("slug", slug);
    const result = await saveStoreCredentials(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? t("x.kaydedilemedi"));
      return;
    }
    toast.success(result.message ?? t("x.kaydedildi"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card p-5">
      <h2 className="text-[14px] font-semibold">{" "}{t("x.yonetici-erisimi")}</h2>
      <p className="mt-0.5 text-[11.5px] muted">{t("x.panel-giris-bilgileri-sifre-degistirmek-icin-mevcut-sifr")}</p>
      <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
        <Field label={t("x.kullanc-ad")}>
          <input name="username" defaultValue={username} className="input" required minLength={3} />
        </Field>
        <Field label="E-posta">
          <input name="email" type="email" defaultValue={email} className="input" required />
        </Field>
        <Field label={t("x.mevcut-sifre")} hint={t("x.yalnzca-sifre-degistirirken-gerekir")}>
          <input name="currentPassword" type="password" className="input" autoComplete="current-password" />
        </Field>
        <Field label={t("x.yeni-sifre")}>
          <input name="newPassword" type="password" className="input" autoComplete="new-password" />
        </Field>
      </div>
      {error ? (
        <p className="note note-danger mt-3 text-[12px]">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn btn-outline" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {t("x.erisim-bilgilerini-guncelle")}
        </button>
      </div>
    </form>
  );
}
