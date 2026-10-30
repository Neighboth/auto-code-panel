import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ActivationForm } from "@/components/auth-forms";
import { brand } from "@/lib/brand";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.bayilik-aktivasyonu") };
}
export const dynamic = "force-dynamic";

const bullets = [
  "x.tek-kullanmlk-bayilik-kodu-ile-annda-magaza-kurulumu",
  "x.kendi-slug-nz-kendi-musteri-tabannz-ve-izole-envanter",
  "x.steam-auto-sync-kod-sihirbaz-ve-canl-2fa-kutuphanesi",
  "x.tema-logo-ve-google-fonts-ile-tam-marka-ozellestirmesi",
];

export default async function ResellerActivationPage() {
  const { t, locale } = await getTranslator();
  return (
    <div className="min-h-dvh">
      <SiteHeader name={brand.name} tagline={brand.tagline} logoUrl={brand.logoUrl} locale={locale.code} />
      <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1fr_480px] lg:py-16">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] muted hover:opacity-70">
            <ArrowLeft size={13} />{t("x.ana-sayfaya-don")}</Link>
          <h1 className="mt-6 text-[32px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">
            {t("x.bayilik-kodunu-aktiflestir")},
            <br />
            <span className="muted">{" "}{t("x.magazan-hemen-ac")}</span>
          </h1>
          <p className="mt-4 max-w-lg text-[14px] leading-relaxed muted">{t("x.satn-aldgnz-bayilik-kodunu-girin-kodun-icinde-tanml-sure")}</p>

          <ul className="mt-7 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-[13px]">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border hairline">
                  <Check size={11} />
                </span>
                <span className="muted">{t(bullet)}</span>
              </li>
            ))}
          </ul>

          <div className="card mt-8 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} />
              <p className="text-[12.5px] font-semibold">{" "}{t("x.guvenli-aktivasyon")}</p>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed muted">{t("x.bayilik-kodlar-tek-kullanmlktr-aktivasyon-sonras-magaza")}</p>
          </div>
        </div>

        <div className="card h-fit p-6">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">{" "}{t("x.adm-1-1")}</p>
            <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em]">{" "}{t("x.magaza-bilgileri")}</h2>
            <p className="mt-1 text-[12.5px] muted">{t("x.slug-adresiniz-magaza-linkiniz-olur-ve-daha-sonra-paneld")}</p>
          </div>
          <ActivationForm />
        </div>
      </main>
    </div>
  );
}
