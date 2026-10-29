import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ActivationForm } from "@/components/auth-forms";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Bayilik Aktivasyonu" };
export const dynamic = "force-dynamic";

const bullets = [
  "Tek kullanımlık bayilik kodu ile anında mağaza kurulumu",
  "Kendi slug'ınız, kendi müşteri tabanınız ve izole envanter",
  "Steam auto-sync, kod sihirbazı ve canlı 2FA kütüphanesi",
  "Tema, logo ve Google Fonts ile tam marka özelleştirmesi",
];

export default async function ResellerActivationPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader name={brand.name} tagline={brand.tagline} logoUrl={brand.logoUrl} />
      <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1fr_480px] lg:py-16">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] muted hover:opacity-70">
            <ArrowLeft size={13} />
            Ana sayfaya dön
          </Link>
          <h1 className="mt-6 text-[32px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">
            Bayilik kodunu aktive et,
            <br />
            <span className="muted">mağazanı hemen aç.</span>
          </h1>
          <p className="mt-4 max-w-lg text-[14px] leading-relaxed muted">
            Satın aldığınız bayilik kodunu girin. Kodun içinde tanımlı süre, hesap limiti ve süre
            uzatma linki otomatik olarak mağazanıza uygulanır.
          </p>

          <ul className="mt-7 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-[13px]">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border hairline">
                  <Check size={11} />
                </span>
                <span className="muted">{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="card mt-8 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} />
              <p className="text-[12.5px] font-semibold">Güvenli aktivasyon</p>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed muted">
              Bayilik kodları tek kullanımlıktır. Aktivasyon sonrası mağaza slug&apos;ınız, hesap limiti ve
              lisans süresi koda bağlı olarak otomatik uygulanır.
            </p>
          </div>
        </div>

        <div className="card h-fit p-6">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">Adım 1 / 1</p>
            <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em]">Mağaza bilgileri</h2>
            <p className="mt-1 text-[12.5px] muted">
              Slug adresiniz mağaza linkiniz olur ve daha sonra panelden değiştirilebilir.
            </p>
          </div>
          <ActivationForm />
        </div>
      </main>
    </div>
  );
}
