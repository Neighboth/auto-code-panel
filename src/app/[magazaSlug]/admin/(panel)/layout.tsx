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

export const dynamic = "force-dynamic";

export default async function StoreAdminPanelLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ magazaSlug: string }>;
}) {
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) {
    const state = await getStoreState(magazaSlug);
    const basePath = state ? await getStoreBasePath(state.store) : `/${magazaSlug.toLowerCase()}`;
    redirect(`${basePath}/admin/giris`);
  }
  if (!guard.state) notFound();

  const { store } = guard.state;
  const settings = await getPlatformSettings();
  const quota = await accountQuota(store);
  const remaining = store.expiresAt ? remainingLabel(store.expiresAt) : "Sınırsız";
  const basePath = await getStoreBasePath(store);

  return (
    <AdminShell
      slug={store.slug}
      basePath={basePath}
      storeName={store.name}
      logoUrl={store.logoUrl}
      adminUsername={guard.session.username}
      remaining={remaining}
      renewalUrl={store.renewalUrl || settings.renewalUrl}
      accountUsed={quota.used}
      accountMax={quota.max}
      suspended={guard.state.suspended}
      expired={guard.state.expired}
      supportEmail={settings.supportEmail}
    >
      {children}
    </AdminShell>
  );
}
