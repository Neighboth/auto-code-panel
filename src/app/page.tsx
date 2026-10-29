import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Boxes,
  Check,
  Clock3,
  Code2,
  Fingerprint,
  Layers,
  LibraryBig,
  Palette,
  ShieldCheck,
  Store,
  Terminal,
  Timer,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/lib/brand";
import { BrandLogo, BrandMark } from "@/components/brand";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description:
    "x.kendi-magazan-ac-oyun-ve-hesap-envanterini-yonet-kod-sih",
};

const features = [
  {
    icon: Store,
    title: "x.tenant-bazl-magaza-izolasyonu",
    text: "x.her-bayi-kendi-slug-kendi-musterileri-ve-kendi-envanteri",
  },
  {
    icon: Timer,
    title: "x.steam-otomatik-senkronizasyon",
    text: "x.steam-linkindeki-appid-ayrstrlr-baslk-kapak-ve-resmi-tr",
  },
  {
    icon: Boxes,
    title: "x.hesap-limiti-ve-envanter",
    text: "x.bayilik-paketinizdeki-maksimum-hesap-says-panelde-anlk-s",
  },
  {
    icon: Fingerprint,
    title: "x.canl-2fa-steam-guard",
    text: "x.totp-secret-ve-steam-shared-secret-asla-taraycya-gitmez",
  },
  {
    icon: Code2,
    title: "x.3-modlu-kod-sihirbaz",
    text: "x.istedigin-x-oyun-tekli-hedef-veya-coklu-paket-kullanm-su",
  },
  {
    icon: Palette,
    title: "x.tam-marka-kontrolu",
    text: "x.tema-rengi-logo-duyuru-band-ve-google-fonts-uzerinden-ca",
  },
];

const steps = [
  {
    title: "x.bayilik-kodunu-satn-al",
    text: "x.sure-ve-hesap-limiti-tanml-tek-kullanmlk-bir-kod-aln",
    icon: Layers,
  },
  {
    title: "x.magazan-saniyeler-icinde-ac",
    text: "x.slug-yonetici-kullanc-ad-ve-sifre-belirleyin-panel-annda",
    icon: Terminal,
  },
  {
    title: "x.urun-ekle-kod-uret-teslim-et",
    text: "x.steam-linkini-yapstrn-envanteri-girin-kod-sihirbazyla-sa",
    icon: LibraryBig,
  },
];

const plans = [
  {
    name: "x.baslangc",
    duration: "x.1-ay",
    price: "₺249",
    limit: "x.40-hesap-limiti",
    features: ["x.tek-magaza", "x.steam-auto-sync", "x.2fa-steam-guard-kodu", "x.kod-sihirbaz"],
    highlight: false,
  },
  {
    name: "x.profesyonel",
    duration: "x.3-ay",
    price: "₺599",
    limit: "x.150-hesap-limiti",
    features: [
      "x.tek-magaza-ozel-slug",
      "x.steam-auto-sync-ve-cron",
      "x.musteri-kutuphanesi",
      "x.font-ve-tema-ozellestirme",
      "x.sure-uzatma-onceligi",
    ],
    highlight: true,
  },
  {
    name: "x.olcek",
    duration: "x.1-yl",
    price: "₺1.899",
    limit: "x.snrsz-hesap",
    features: [
      "x.snrsz-envanter",
      "x.500-luk-toplu-kod-uretimi",
      "x.kullanlms-kod-detay-raporu",
      "x.oncelikli-destek",
    ],
    highlight: false,
  },
];

const faqs = [
  {
    q: "x.kod-kullanm-suresi-ne-zaman-baslar",
    a: "x.kodun-uzerinde-tanml-sure-kodun-son-kullanma-tarihi-degi",
  },
  {
    q: "x.2fa-ve-steam-guard-kodlar-guvenli-mi",
    a: "x.secret-anahtarlar-hicbir-zaman-frontend-e-gonderilmez-ku",
  },
  {
    q: "x.suresi-dolan-bayiler-ne-olur",
    a: "x.bayilik-suresi-bittiginde-magaza-vitrini-otomatik-olarak",
  },
  {
    q: "x.musteriler-uye-olmadan-kod-kullanabilir-mi",
    a: "x.evet-misafir-olarak-teslimat-alnabilir-ancak-sayfa-kapan",
  },
  {
    q: "x.steam-fiyatlar-otomatik-guncelleniyor-mu",
    a: "x.steam-linki-girilen-ve-auto-sync-secenegi-ack-urunler-ic",
  },
];

export default async function LandingPage() {
  const { t } = await getTranslator();
  return (
    <div className="min-h-dvh">
      <SiteHeader name={brand.name} tagline={brand.tagline} logoUrl={brand.logoUrl} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b hairline">
        <div className="pointer-events-none absolute inset-0 hairline-grid opacity-[0.5]" />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              "radial-gradient(ellipse at 50% -20%, color-mix(in srgb, var(--fg) 9%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 hairline">
              <span className="live-dot" style={{ color: "#16a34a" }} />
              <span className="text-[11.5px] font-medium tracking-[0.02em] muted">{t("x.multi-tenant-teslimat-altyaps-v2-4")}</span>
            </div>
            <h1 className="mt-5 text-[28px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[38px] lg:text-[52px]">{t("x.dijital-hesap-satsn")}<br />
              <span className="muted">{" "}{t("x.tek-panelden-yonetin")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[14.5px] leading-relaxed muted">{t("x.oyun-hesap-ve-redeem-kodu-teslimatn-uctan-uca-otomatikle")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/bayi" className="btn btn-dark btn-lg">{t("x.bayilik-kodunu-aktiflestir")}<ArrowRight size={15} />
              </Link>
              <Link href="/super-admin" className="btn btn-gray btn-lg">{t("x.yonetici-girisi")}<ArrowRight size={15} />
              </Link>
            </div>
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 border-t pt-5 hairline">
              {[
                { value: "3 mod", label: t("x.kod-sihirbaz") },
                { value: "30 sn", label: t("x.canl-kod-sayac") },
                { value: "%100", label: "Tenant izolasyonu" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-[17px] font-semibold tracking-[-0.02em]">{stat.value}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Product mock */}
          <div className="relative">
            <div className="card overflow-hidden p-0 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between border-b px-4 py-3 hairline">
                <div className="flex items-center gap-2">
                  <BrandMark size={18} />
                  <span className="text-[12px] font-semibold">magaza / kodlar{/* i18n-ignore */}</span>
                </div>
                <span className="badge badge-green">
                  <span className="live-dot" /> aktif
                </span>
              </div>
              <div className="grid grid-cols-3 gap-px border-b hairline" style={{ background: "var(--border)" }}>
                {[
                  { label: "Aktif kod", value: "148" },
                  { label: "Teslimat", value: "92" },
                  { label: "Hesap", value: "37 / 60" },
                ].map((item) => (
                  <div key={item.label} className="px-4 py-3" style={{ background: "var(--bg-elevated)" }}>
                    <p className="text-[10px] uppercase tracking-[0.08em] muted">{item.label}</p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {[
                  { code: "KEYR-8FA2K-P4M7Q", type: t("x.istedigin-2-oyun"), status: "Aktif", tone: "badge-blue" },
                  { code: "KEYR-QP93M-2XK7A", type: t("x.elden-ring-30-gun"), status: t("x.kullanld"), tone: "badge-green" },
                  { code: "KEYR-Z7LDM-93PQT", type: t("x.rdr2-itt-7-gun"), status: t("x.suresi-doldu"), tone: "badge-red" },
                ].map((row) => (
                  <div key={row.code} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="mono truncate text-[11.5px] font-medium tracking-tight">{row.code}</p>
                      <p className="mt-0.5 truncate text-[10.5px] muted">{row.type}</p>
                    </div>
                    <span className={`badge ${row.tone}`}>{row.status}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3 hairline">
                <div className="flex items-center gap-2 text-[11px] muted">
                  <ShieldCheck size={13} />
                  Steam Guard kodu · 30 sn
                </div>
                <span className="mono rounded-md border px-2 py-1 text-[12px] font-semibold tracking-[0.2em] hairline">
                  K7M2Q
                </span>
              </div>
            </div>
            <div className="card absolute -bottom-6 -left-4 hidden w-52 p-3 sm:block">
              <p className="text-[10px] uppercase tracking-[0.08em] muted">{t("x.kalan-bayilik")}</p>
              <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">{" "}{t("x.21-gun-4-saat")}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full w-[68%] rounded-full" style={{ background: "var(--fg)" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capability strip */}
      <section className="border-b hairline">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] muted">
            Entegrasyonlar
          </p>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] font-medium muted">
            <span>Steam Store API</span>
            <span>TOTP · RFC 6238</span>
            <span>Steam Guard HMAC-SHA1</span>
            <span>PostgreSQL · Drizzle ORM</span>
            <span>Google Fonts</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="border-b py-16 hairline lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">{t("x.ozellikler")}</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">{t("x.teslimat-operasyonunun-tamam-tek-altyapda")}</h2>
            <p className="mt-3 text-[14px] leading-relaxed muted">{t("x.vitrin-envanter-kod-uretimi-canl-2fa-ve-marka-yonetimi-b")}</p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border hairline sm:grid-cols-2 lg:grid-cols-3" style={{ background: "var(--border)" }}>
            {features.map((feature) => (
              <div key={t(feature.title)} className="p-6" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
                  <feature.icon size={16} strokeWidth={1.7} />
                </div>
                <h3 className="mt-4 text-[14px] font-semibold tracking-[-0.01em]">{t(feature.title)}</h3>
                <p className="mt-2 text-[12.8px] leading-relaxed muted">{t(feature.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="nasil-calisir" className="border-b py-16 hairline lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">{" "}{t("x.nasl-calsr")}</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">{t("x.uc-admda-satsa-hazr")}</h2>
            </div>
            <Link href="/bayi" className="btn btn-outline">
              Aktivasyona git
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={t(step.title)} className="card relative p-6">
                <div className="flex items-center justify-between">
                  <span className="mono text-[11px] muted">0{index + 1}</span>
                  <step.icon size={17} strokeWidth={1.7} className="muted" />
                </div>
                <div className="mt-6 h-px w-full" style={{ background: "var(--border)" }} />
                <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em]">{t(step.title)}</h3>
                <p className="mt-2 text-[13px] leading-relaxed muted">{t(step.text)}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 grid gap-6 rounded-2xl border p-6 hairline lg:grid-cols-[0.95fr_1.05fr] lg:p-9">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] muted hairline">
                <Clock3 size={12} />{t("x.erisim-suresi-kural")}</div>
              <h3 className="mt-4 text-[22px] font-semibold leading-snug tracking-[-0.02em]">{t("x.sure-kodun-raf-omru-degil-musterinin-erisim-hakkdr")}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed muted">{t("x.kod-olustururken-sectiginiz-1-gun-1-ay-veya-ozel-saat-de")}<span className="mono mx-1 rounded px-1.5 py-0.5 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
                  expiresAt &lt; now()
                </span>{t("x.kontrolu-yapar-hesap-sifresi-ve-2fa-kodu-bir-daha-donmez")}</p>
              <ul className="mt-5 space-y-2">
                {[
                  t("x.kullanlms-kod-detaynda-atanan-hesap-id-leri-ve-bitis-tar"),
                  t("x.suresi-dolan-teslimat-otomatik-imha"),
                  t("x.misafir-teslimat-icin-kalc-olmayan-sonuc-ekran"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12.8px] muted">
                    <Check size={14} className="mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border p-4 hairline" style={{ background: "var(--bg)" }}>
              <div className="flex items-center justify-between">
                <p className="mono text-[11.5px] font-medium">KEYR-DEMO-BUNDLE</p>
                <span className="badge badge-blue">{t("x.kullanld")}</span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { label: t("x.musteri"), value: "demo" },
                  { label: t("x.urunler"), value: "Red Dead Redemption 2, It Takes Two" },
                  { label: "Atanan hesaplar", value: "#12 · #18" },
                  { label: t("x.baslangc"), value: "12.03.2026 14:22" },
                  { label: t("x.bitis"), value: "19.03.2026 14:22" },
                ].map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 border-b pb-2.5 last:border-0 hairline">
                    <span className="text-[11px] uppercase tracking-[0.06em] muted">{row.label}</span>
                    <span className="text-right text-[12px] font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border px-3 py-2 hairline">
                <span className="text-[11.5px] muted">Steam Guard</span>
                <span className="mono text-[13px] font-semibold tracking-[0.22em]">B4XQ9</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="fiyatlandirma" className="border-b py-16 hairline lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">{t("x.fiyatlandrma")}</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
              {t("x.bayilik-paketleri")}
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed muted">{t("x.her-paket-tek-magaza-icindir-bayilik-kodu-satn-alma-sonr")}</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={t(plan.name)}
                className="card relative flex flex-col p-6"
                style={
                  plan.highlight
                    ? { borderColor: "var(--fg)", boxShadow: "0 20px 50px -30px rgba(0,0,0,0.5)" }
                    : undefined
                }
              >
                {plan.highlight ? (
                  <span className="absolute right-5 top-5 badge badge-blue">{" "}{t("x.en-cok-tercih-edilen")}</span>
                ) : null}
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] muted">{t(plan.name)}</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[30px] font-semibold tracking-[-0.03em]">{t(plan.price)}</span>
                  <span className="text-[12px] muted">/ {t(plan.duration)}</span>
                </div>
                <p className="mt-2 text-[12px] muted">{t(plan.limit)}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[12.8px]">
                      <Check size={14} className="mt-0.5 shrink-0" />
                      <span>{t(feature)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/bayi"
                  className={`btn mt-6 w-full ${plan.highlight ? "btn-dark" : "btn-outline"}`}
                >
                  Bayilik kodunu kullan
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="sss" className="border-b py-16 hairline lg:py-24">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">SSS</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em]">{t("x.sk-sorulan-sorular")}</h2>
            <p className="mt-3 text-[13px] leading-relaxed muted">{t("x.aradgnz-cevab-bulamadysanz-destek-ekibimiz-telegram-uzer")}</p>
          </div>
          <div className="divide-y hairline">
            {faqs.map((faq) => (
              <details key={t(faq.q)} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="text-[13.5px] font-medium">{t(faq.q)}</span>
                  <span className="text-[18px] leading-none muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 pr-8 text-[12.8px] leading-relaxed muted">{t(faq.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="relative overflow-hidden rounded-2xl border p-8 hairline lg:p-12" style={{ background: "var(--bg-elevated)" }}>
            <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px]">{t("x.magazanz-bu-dakika-acn")}</h2>
                <p className="mt-2 max-w-lg text-[13px] leading-relaxed muted">{t("x.bayilik-kodunuzu-ve-magaza-slug-nz-girin-kurulum-urun-ek")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/bayi" className="btn btn-dark btn-lg">
                  {t("x.bayilik-aktivasyonu")}
                  <ArrowRight size={15} />
                </Link>
                <Link href="/super-admin" className="btn btn-gray btn-lg">{t("x.yonetici-girisi")}<ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t py-9 hairline">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-5 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo logoUrl={brand.logoUrl} size={22} />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold">{brand.name}</p>
              <p className="truncate text-[11px] muted">{brand.tagline}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[11.5px] muted">
            <Link href="/bayi" className="hover:opacity-70">
              {t("x.bayilik")}
            </Link>
            <Link href="/super-admin" className="hover:opacity-70">{t("x.yonetici-girisi")}</Link>
          </div>
          <p className="w-full text-[10.5px] muted sm:w-auto">
            © {new Date().getFullYear()} {brand.name}. {t("x.tum-haklar-sakldr")}
          </p>
        </div>
      </footer>
    </div>
  );
}
