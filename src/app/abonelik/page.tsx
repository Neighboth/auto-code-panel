import Link from "next/link";
import { brand } from "@/lib/brand";
import { readUnsubscribeToken } from "@/lib/mail-prefs";
import { UnsubscribeForm } from "@/components/unsubscribe-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-posta tercihleri", robots: { index: false, follow: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const token = params.t ?? "";
  const resolved = readUnsubscribeToken(token);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] muted">{brand.name}</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">E-posta bildirimleri</h1>

      {!resolved ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed muted">
            Bu bağlantı geçersiz veya değiştirilmiş. Bildirimleri kapatmak için mağaza panelinizdeki
            <strong> Profil → E-posta bildirimleri</strong> bölümünü kullanabilirsiniz.
          </p>
          <Link href="/" className="btn btn-outline mt-5 w-fit">
            Ana sayfaya dön
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-[13px] leading-relaxed muted">
            Aşağıdaki tercih yalnızca bu bağlantının gönderildiği adres için geçerlidir. İşlemi
            onayladığınızda duyuru ve pazarlama e-postaları durur; zorunlu güvenlik/teslimat
            bildirimleri için ikinci seçeneği kullanabilirsiniz.
          </p>
          <UnsubscribeForm token={token} />
        </>
      )}
    </main>
  );
}
