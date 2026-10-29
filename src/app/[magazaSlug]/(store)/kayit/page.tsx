import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/session";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { CustomerAuthForm } from "@/components/auth-forms";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("x.kayt-ol") };
}

export default async function StoreRegisterPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const basePath = await getStoreBasePath(state.store);
  const { locale, t } = await getTranslator();
  const session = await getCustomerSession();
  if (session && session.storeId === state.store.id) redirect(`${basePath}/kutuphane`);

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12">
      <div className="card p-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">
          {t("auth.customerBadge")}
        </p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">{t("auth.createAccount")}</h1>
        <p className="mt-1.5 text-[12.5px] muted">
          {t("auth.registerSub")}
        </p>
        <div className="mt-5">
          <CustomerAuthForm
            slug={state.store.slug}
            mode="register"
            basePath={basePath}
            locale={locale.code}
            autoMessage={t("auth.registerAuto")}
          />
        </div>
        <p className="mt-4 text-center text-[11.5px] muted">
          {t("auth.alreadyMember")}{" "}
          <Link href={`${basePath}/giris`} className="underline underline-offset-2" style={{ color: "var(--fg)" }}>
            {t("auth.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
