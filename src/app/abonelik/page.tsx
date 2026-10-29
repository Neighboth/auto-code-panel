import Link from "next/link";
import { brand } from "@/lib/brand";
import { readUnsubscribeToken } from "@/lib/mail-prefs";
import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.e-posta-tercihleri"), robots: { index: false, follow: false } };
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await getTranslator();
  const params = await searchParams;
  const token = params.t ?? "";
  const resolved = readUnsubscribeToken(token);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">{brand.name}</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">E-posta bildirimleri</h1>

      {!resolved ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed muted">{t("x.bu-baglant-gecersiz-veya-degistirilmis-bildirimleri-kapa")}<strong> Profil → E-posta bildirimleri</strong>{t("x.bolumunu-kullanabilirsiniz")}</p>
          <Link href="/" className="btn btn-outline mt-5 w-fit">{t("x.ana-sayfaya-don")}</Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-[13px] leading-relaxed muted">{t("x.asagdaki-tercih-yalnzca-bu-baglantnn-gonderildigi-adres")}</p>
          <UnsubscribeForm token={token} />
        </>
      )}
    </main>
  );
}
