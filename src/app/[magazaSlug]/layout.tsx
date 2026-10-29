import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { googleFontHref } from "@/lib/fonts";
import { getStoreState } from "@/lib/tenant";
import { normalizeDomain, normalizeHost } from "@/lib/domain";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type StoreLayoutProps = {
  children: ReactNode;
  params: Promise<{ magazaSlug: string }>;
};

export async function generateMetadata({ params }: StoreLayoutProps): Promise<Metadata> {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) return { title: t("x.magaza-bulunamad") };
  const { store } = state;
  return {
    title: { default: `${store.title} · ${store.name}`, template: `%s · ${store.name}` },
    description: store.subtitle,
    icons: store.faviconUrl ? { icon: store.faviconUrl } : undefined,
  };
}

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const { store } = state;

  /*
   * Verified custom domain wins: the slug stays in the database (and keeps
   * working while the domain is unverified) but visitors landing on
   * /<slug> are forwarded to the branded domain.
   */
  if (store.customDomain && store.customDomainVerifiedAt) {
    const headerStore = await headers();
    const host = normalizeHost(
      headerStore.get("host") ?? headerStore.get("x-forwarded-host") ?? "",
    );
    const domain = normalizeDomain(store.customDomain);
    const isLocal = !host || host === "localhost" || host.endsWith(".localhost") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (host && host !== domain && !isLocal) {
      const path = headerStore.get("x-pathname") ?? "";
      redirect(`https://${domain}${path && path.startsWith(`/${store.slug}`) ? path.slice(store.slug.length + 1) : ""}`);
    }
  }

  const fontHref = googleFontHref([store.fontFamily]);

  const style = {
    "--store-primary": store.primaryColor,
    "--store-accent": store.accentColor,
    "--store-font": `"${store.fontFamily}"`,
    fontFamily: `"${store.fontFamily}", ui-sans-serif, system-ui, -apple-system, sans-serif`,
  } as CSSProperties;

  return (
    <div className="min-h-dvh" style={style}>
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      {children}
    </div>
  );
}
