import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { remainingLabel } from "@/lib/format";
import {
  accountQuota,
  getPlatformSettings,
  getStoreBasePath,
  getStoreState,
  requireStoreAdmin,
} from "@/lib/tenant";
import { AdminShell } from "@/components/admin/shell";
import { getLocale } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StoreAdminPanelLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ magazaSlug: string }>;
}) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  if (!guard) {
    const basePath = await getStoreBasePath(state.store);
    redirect(`${basePath}/admin/giris`);
  }

  const { store, suspended, expired } = state;
  const settings = await getPlatformSettings();
  const quota = await accountQuota(store);
  const remaining = store.expiresAt ? remainingLabel(store.expiresAt) : t("x.snrsz");
  const basePath = await getStoreBasePath(store);
  const locale = await getLocale();

  return (
    <AdminShell
      slug={store.slug}
      basePath={basePath}
      storeName={store.name}
      logoUrl={store.logoUrl}
      adminUsername={guard.session.username}
      remaining={remaining}
      renewalUrl={store.renewalUrl || settings.renewalUrl || env.renewalUrl}
      accountUsed={quota.used}
      accountMax={quota.max}
      suspended={suspended}
      expired={expired}
      supportEmail={env.supportEmail || settings.supportEmail}
      locale={locale.code}

    >
      {children}
    </AdminShell>
  );
}
