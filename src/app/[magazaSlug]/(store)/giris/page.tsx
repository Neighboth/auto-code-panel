import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCustomerSession, getStoreAdminSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { StoreLoginTabs } from "@/components/auth-forms";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.giris-yap") };
}

export default async function StoreLoginPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const { locale, t } = await getTranslator();

  /*
   * Already signed in? Both entry points (/giris and /kayit) must behave the
   * same way: a customer goes to the library, the shop owner to the panel.
   * Previously only this page redirected the manager, so /kayit showed a
   * registration form to someone who was already logged in.
   */
  const session = await getCustomerSession();
  if (session && session.storeId === state.store.id) redirect(`${basePath}/kutuphane`);
  const adminSession = await getStoreAdminSession();
  if (adminSession && adminSession.storeId === state.store.id) redirect(`${basePath}/admin`);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-14">
      <Link
        href={basePath || "/"}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] muted hover:opacity-70"
      >
        <ArrowLeft size={13} />
        {state.store.name}
      </Link>

      <div className="card overflow-hidden">
        <div className="border-b px-5 py-5 hairline sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
              style={{ background: "var(--store-primary)" }}
            >
              {state.store.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{state.store.name}</p>
              <p className="text-[10.5px] uppercase tracking-[0.1em] muted">{t("nav.login")}</p>
            </div>
          </div>
          <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.02em]">{t("auth.welcomeBack")}</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed muted">{t("auth.loginSub")}</p>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <StoreLoginTabs
            slug={state.store.slug}
            storeName={state.store.name}
            basePath={basePath}
            locale={locale.code}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 hairline sm:px-6">
          <p className="text-[11.5px] muted">
            {t("auth.noAccount")}{" "}
            <Link
              href={`${basePath}/kayit`}
              className="font-medium underline underline-offset-2"
              style={{ color: "var(--fg)" }}
            >
              {t("auth.createAccount")}
            </Link>
          </p>
          <Link
            href={`${basePath}/admin/giris`}
            className="inline-flex items-center gap-1.5 text-[11.5px] muted hover:opacity-70"
          >
            <ShieldCheck size={12} />
            {t("store.openAdmin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
