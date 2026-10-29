import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerSession, getStoreAdminSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { getTranslator } from "@/lib/i18n/server";
import { StoreLoginTabs } from "@/components/auth-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giriş Yap" };

export default async function StoreLoginPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const { locale, t } = await getTranslator();
  const session = await getCustomerSession();
  if (session && session.storeId === state.store.id) redirect(`${basePath}/kutuphane`);
  const adminSession = await getStoreAdminSession();
  if (adminSession && adminSession.storeId === state.store.id) redirect(`${basePath}/admin`);

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12">
      <div className="card p-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{t("nav.login")}</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">{t("auth.welcomeBack")}</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed muted">
          {t("auth.loginSub")}
        </p>
        <div className="mt-5">
          <StoreLoginTabs
            slug={state.store.slug}
            storeName={state.store.name}
            basePath={basePath}
            locale={locale.code}
          />
        </div>
        <p className="mt-4 text-center text-[11.5px] muted">
          {t("auth.noAccount")}{" "}
          <Link
            href={`${basePath}/kayit`}
            className="underline underline-offset-2"
            style={{ color: "var(--fg)" }}
          >
            {t("auth.createAccount")}
          </Link>
        </p>
      </div>
    </div>
  );
}
