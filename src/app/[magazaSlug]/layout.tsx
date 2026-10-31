import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { familyStylesheet, fontProvider } from "@/lib/fonts";
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

  /*
   * Two font sources: an uploaded typeface (`fontUrl`, self-hosted in the media
   * library) or a Google Fonts family from the catalogue. The uploaded file wins
   * because it is what the owner explicitly uploaded.
   */
  const uploaded = store.fontUrl?.trim() ?? "";
  const familyName = uploaded ? store.fontLabel || "StoreFont" : store.fontFamily;
  const fontHref = uploaded ? "" : familyStylesheet(store.fontFamily);
  const fontHost = uploaded || fontProvider(store.fontFamily) === "fontshare" ? "https://api.fontshare.com" : "https://fonts.gstatic.com";
  const fontFace = uploaded
    ? `@font-face{font-family:"${familyName.replace(/"/g, "")}";src:url("${uploaded}");font-display:swap;font-weight:100 900;}`
    : "";

  const style = {
    "--store-primary": store.primaryColor,
    "--store-accent": store.accentColor,
    "--store-font": `"${familyName}"`,
    fontFamily: `"${familyName}", ui-sans-serif, system-ui, -apple-system, sans-serif`,
  } as CSSProperties;

  /*
   * Font loading is deliberately *non-blocking*.
   *
   * A plain `<link rel="stylesheet">` to fonts.googleapis.com is render-blocking:
   * wherever that host is slow or filtered, the whole storefront sat blank for
   * 15+ seconds before the first paint. Loading it with `media="print"` and
   * flipping the media on load gives the browser the font without ever holding
   * the page hostage; `<noscript>` keeps the old behaviour for JS-less clients.
   */
  return (
    <div className="min-h-dvh" style={style}>
      {fontFace ? <style dangerouslySetInnerHTML={{ __html: fontFace }} /> : null}
      {/* Only this store's own font origin is preconnected — never a whole catalogue. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href={fontHost} crossOrigin="anonymous" />
      {fontHref ? (
        <>
          {/*
            `media="print"` + inline `onload` is the classic async-CSS pattern:
            the request never blocks the first paint, and the sheet is applied as
            soon as it arrives. Server components cannot attach `onLoad`, so the
            tag is emitted as HTML (the href is escaped).
          */}
          <div
            dangerouslySetInnerHTML={{
              __html: `<link id="store-font-css" rel="stylesheet" href="${fontHref.replace(/"/g, "&quot;")}" media="print" onload="this.media='all'">`,
            }}
          />
          <noscript>
            <link rel="stylesheet" href={fontHref} />
          </noscript>
        </>
      ) : null}
      {children}
    </div>
  );
}
