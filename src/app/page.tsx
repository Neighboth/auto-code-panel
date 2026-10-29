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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description:
    "Kendi mağazanı aç, oyun ve hesap envanterini yönet, kod sihirbazıyla anında teslimat yap. 2FA ve Steam Guard kodları sunucu tarafında üretilir.",
};

const features = [
  {
    icon: Store,
    title: "Tenant bazlı mağaza izolasyonu",
    text: "Her bayi kendi slug'ı, kendi müşterileri ve kendi envanteriyle çalışır. Sorgular tenant_id ile filtrelenir; bir mağaza diğerinin verisini göremez.",
  },
  {
    icon: Timer,
    title: "Steam otomatik senkronizasyon",
    text: "Steam linkindeki appId ayrıştırılır; başlık, kapak ve resmi TR fiyatı çekilir. Auto-Sync açık ürünler cron job ile güncel kalır.",
  },
  {
    icon: Boxes,
    title: "Hesap limiti ve envanter",
    text: "Bayilik paketinizdeki maksimum hesap sayısı panelde anlık sayılır. Limit dolduğunda yeni hesap ekleme sunucu tarafında engellenir.",
  },
  {
    icon: Fingerprint,
    title: "Canlı 2FA & Steam Guard",
    text: "TOTP secret ve Steam shared_secret asla tarayıcıya gitmez. Kodlar HMAC-SHA1 tabanlı olarak backend'de üretilir, ekranda 30 saniyelik sayaçla döner.",
  },
  {
    icon: Code2,
    title: "3 modlu kod sihirbazı",
    text: "İstediğin X oyun, tekli hedef veya çoklu paket. Kullanım süresi kodun son kullanma tarihi değil, kullanıldığı andan itibaren erişim süresidir.",
  },
  {
    icon: Palette,
    title: "Tam marka kontrolü",
    text: "Tema rengi, logo, duyuru bandı ve Google Fonts üzerinden canlı önizlemeli font seçimi. Tüm mağaza arayüzü CSS değişkenleriyle anında güncellenir.",
  },
];

const steps = [
  {
    title: "Bayilik kodunu satın al",
    text: "Süre ve hesap limiti tanımlı tek kullanımlık bir kod alın.",
    icon: Layers,
  },
  {
    title: "Mağazanı saniyeler içinde aç",
    text: "Slug, yönetici kullanıcı adı ve şifre belirleyin. Panel anında hazır.",
    icon: Terminal,
  },
  {
    title: "Ürün ekle, kod üret, teslim et",
    text: "Steam linkini yapıştırın, envanteri girin, kod sihirbazıyla satışa başlayın.",
    icon: LibraryBig,
  },
];

const plans = [
  {
    name: "Başlangıç",
    duration: "1 Ay",
    price: "₺249",
    limit: "40 hesap limiti",
    features: ["Tek mağaza", "Steam auto-sync", "2FA / Steam Guard kodu", "Kod sihirbazı"],
    highlight: false,
  },
  {
    name: "Profesyonel",
    duration: "3 Ay",
    price: "₺599",
    limit: "150 hesap limiti",
    features: [
      "Tek mağaza + özel slug",
      "Steam auto-sync ve cron",
      "Müşteri kütüphanesi",
      "Font ve tema özelleştirme",
      "Süre uzatma önceliği",
    ],
    highlight: true,
  },
  {
    name: "Ölçek",
    duration: "1 Yıl",
    price: "₺1.899",
    limit: "Sınırsız hesap",
    features: [
      "Sınırsız envanter",
      "500'lük toplu kod üretimi",
      "Kullanılmış kod detay raporu",
      "Öncelikli destek",
    ],
    highlight: false,
  },
];

const faqs = [
  {
    q: "Kod kullanım süresi ne zaman başlar?",
    a: "Kodun üzerinde tanımlı süre, kodun son kullanma tarihi değildir. Müşteri kodu kullandığı saniyede başlar; örneğin 30 günlük kod, teslimat anından 30 gün sonra otomatik olarak imha edilir.",
  },
  {
    q: "2FA ve Steam Guard kodları güvenli mi?",
    a: "Secret anahtarları hiçbir zaman frontend'e gönderilmez. Kütüphane ekranındaki buton, sunucuda HMAC-SHA1 tabanlı kod üretip yalnızca o anki 5 haneli Steam Guard veya 6 haneli TOTP kodunu döner.",
  },
  {
    q: "Süresi dolan bayiler ne olur?",
    a: "Bayilik süresi bittiğinde mağaza vitrini otomatik olarak 'Süresi Dolmuş - Askıda' moduna geçer, teslimat durur. Süper admin panelinden süre eklenerek mağaza yeniden aktifleştirilir.",
  },
  {
    q: "Müşteriler üye olmadan kod kullanabilir mi?",
    a: "Evet. Misafir olarak teslimat alınabilir ancak sayfa kapandığında hesap bilgileri ve canlı kodlar bir daha görüntülenemez. Kalıcı erişim için yalnızca kullanıcı adı ve şifre ile hesap oluşturmak yeterlidir.",
  },
  {
    q: "Steam fiyatları otomatik güncelleniyor mu?",
    a: "Steam linki girilen ve Auto-Sync seçeneği açık ürünler için zamanlanmış görev, Steam Store API üzerinden başlık, kapak görseli ve resmi TR fiyatını çekerek veritabanını günceller.",
  },
];

export default function LandingPage() {
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
              <span className="text-[11.5px] font-medium tracking-[0.02em] muted">
                Multi-tenant teslimat altyapısı · v2.4
              </span>
            </div>
            <h1 className="mt-5 text-[28px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[38px] lg:text-[52px]">
              Dijital hesap satışını
              <br />
              <span className="muted">tek panelden yönetin.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[14.5px] leading-relaxed muted">
              Oyun, hesap ve redeem kodu teslimatını uçtan uca otomatikleştirin. Steam Guard ve
              TOTP kodları sunucuda üretilir, erişim süresi dolan hesaplar müşteri kütüphanesinden
              otomatik olarak imha edilir.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/bayi" className="btn btn-dark btn-lg">
                Bayilik kodunu aktifleştir
                <ArrowRight size={15} />
              </Link>
              <Link href="/super-admin" className="btn btn-gray btn-lg">
                Yönetici Girişi
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 border-t pt-5 hairline">
              {[
                { value: "3 mod", label: "Kod sihirbazı" },
                { value: "30 sn", label: "Canlı kod sayacı" },
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
                  <span className="text-[12px] font-semibold">magaza / kodlar</span>
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
                  { code: "KEYR-8FA2K-P4M7Q", type: "İstediğin 2 oyun", status: "Aktif", tone: "badge-blue" },
                  { code: "KEYR-QP93M-2XK7A", type: "Elden Ring · 30 gün", status: "Kullanıldı", tone: "badge-green" },
                  { code: "KEYR-Z7LDM-93PQT", type: "RDR2 + ITT · 7 gün", status: "Süresi doldu", tone: "badge-red" },
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
              <p className="text-[10px] uppercase tracking-[0.08em] muted">Kalan bayilik</p>
              <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">21 gün 4 saat</p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">Özellikler</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
              Teslimat operasyonunun tamamı tek altyapıda.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed muted">
              Vitrin, envanter, kod üretimi, canlı 2FA ve marka yönetimi birbirine bağlı çalışır.
              Her modül çoklu mağaza mantığıyla tasarlandı.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border hairline sm:grid-cols-2 lg:grid-cols-3" style={{ background: "var(--border)" }}>
            {features.map((feature) => (
              <div key={feature.title} className="p-6" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border hairline">
                  <feature.icon size={16} strokeWidth={1.7} />
                </div>
                <h3 className="mt-4 text-[14px] font-semibold tracking-[-0.01em]">{feature.title}</h3>
                <p className="mt-2 text-[12.8px] leading-relaxed muted">{feature.text}</p>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">Nasıl çalışır</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
                Üç adımda satışa hazır.
              </h2>
            </div>
            <Link href="/bayi" className="btn btn-outline">
              Aktivasyona git
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="card relative p-6">
                <div className="flex items-center justify-between">
                  <span className="mono text-[11px] muted">0{index + 1}</span>
                  <step.icon size={17} strokeWidth={1.7} className="muted" />
                </div>
                <div className="mt-6 h-px w-full" style={{ background: "var(--border)" }} />
                <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em]">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed muted">{step.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 grid gap-6 rounded-2xl border p-6 hairline lg:grid-cols-[0.95fr_1.05fr] lg:p-9">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] muted hairline">
                <Clock3 size={12} />
                Erişim süresi kuralı
              </div>
              <h3 className="mt-4 text-[22px] font-semibold leading-snug tracking-[-0.02em]">
                Süre kodun raf ömrü değil, müşterinin erişim hakkıdır.
              </h3>
              <p className="mt-3 text-[13.5px] leading-relaxed muted">
                Kod oluştururken seçtiğiniz 1 gün, 1 ay veya özel saat değeri, müşteri kodu
                kullandığı saniyede başlar. Süre bittiğinde backend her istekte
                <span className="mono mx-1 rounded px-1.5 py-0.5 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--fg) 6%, transparent)" }}>
                  expiresAt &lt; now()
                </span>
                kontrolü yapar; hesap şifresi ve 2FA kodu bir daha dönmez.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  "Kullanılmış kod detayında atanan hesap ID'leri ve bitiş tarihi",
                  "Süresi dolan teslimat otomatik imha",
                  "Misafir teslimat için kalıcı olmayan sonuç ekranı",
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
                <span className="badge badge-blue">Kullanıldı</span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { label: "Müşteri", value: "demo" },
                  { label: "Ürünler", value: "Red Dead Redemption 2, It Takes Two" },
                  { label: "Atanan hesaplar", value: "#12 · #18" },
                  { label: "Başlangıç", value: "12.03.2026 14:22" },
                  { label: "Bitiş", value: "19.03.2026 14:22" },
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">Fiyatlandırma</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
              Bayilik paketleri.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed muted">
              Her paket tek mağaza içindir. Bayilik kodu, satın alma sonrası süper admin tarafından
              üretilir ve tek kullanımlıktır.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className="card relative flex flex-col p-6"
                style={
                  plan.highlight
                    ? { borderColor: "var(--fg)", boxShadow: "0 20px 50px -30px rgba(0,0,0,0.5)" }
                    : undefined
                }
              >
                {plan.highlight ? (
                  <span className="absolute right-5 top-5 badge badge-blue">En çok tercih edilen</span>
                ) : null}
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] muted">{plan.name}</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[30px] font-semibold tracking-[-0.03em]">{plan.price}</span>
                  <span className="text-[12px] muted">/ {plan.duration}</span>
                </div>
                <p className="mt-2 text-[12px] muted">{plan.limit}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[12.8px]">
                      <Check size={14} className="mt-0.5 shrink-0" />
                      <span>{feature}</span>
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
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em]">
              Sık sorulan sorular.
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed muted">
              Aradığınız cevabı bulamadıysanız destek ekibimiz Telegram üzerinden ulaşılabilir.
            </p>
          </div>
          <div className="divide-y hairline">
            {faqs.map((faq) => (
              <details key={faq.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="text-[13.5px] font-medium">{faq.q}</span>
                  <span className="text-[18px] leading-none muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 pr-8 text-[12.8px] leading-relaxed muted">{faq.a}</p>
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
                <h2 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px]">
                  Mağazanızı bu dakika açın.
                </h2>
                <p className="mt-2 max-w-lg text-[13px] leading-relaxed muted">
                  Bayilik kodunuzu ve mağaza slug&apos;ınızı girin. Kurulum, ürün ekleme ve ilk
                  teslimatınız dahil her şey tek ekranda.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/bayi" className="btn btn-dark btn-lg">
                  Bayilik Aktivasyonu
                  <ArrowRight size={15} />
                </Link>
                <Link href="/super-admin" className="btn btn-gray btn-lg">
                  Yönetici Girişi
                  <ArrowRight size={15} />
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
              Bayilik
            </Link>
            <Link href="/super-admin" className="hover:opacity-70">
              Yönetici Girişi
            </Link>
          </div>
          <p className="w-full text-[10.5px] muted sm:w-auto">
            © {new Date().getFullYear()} {brand.name}. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  );
}
