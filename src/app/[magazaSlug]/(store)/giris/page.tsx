import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { CustomerAuthForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giriş Yap" };

export default async function StoreLoginPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const session = await getCustomerSession();
  if (session && session.storeId === state.store.id) redirect(`${basePath}/kutuphane`);

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12">
      <div className="card p-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Müşteri hesabı</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">Tekrar hoş geldiniz</h1>
        <p className="mt-1.5 text-[12.5px] muted">
          Kütüphanenize, hesap bilgilerinize ve canlı 2FA kodlarınıza erişmek için giriş yapın.
        </p>
        <div className="mt-5">
          <CustomerAuthForm slug={state.store.slug} mode="login" basePath={basePath} />
        </div>
        <p className="mt-4 text-center text-[11.5px] muted">
          Hesabınız yok mu?{" "}
          <Link href={`${basePath}/kayit`} className="underline underline-offset-2" style={{ color: "var(--fg)" }}>
            Hemen oluştur
          </Link>
        </p>

      </div>
    </div>
  );
}
