import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { googleFontHref } from "@/lib/fonts";
import { getStoreState } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type StoreLayoutProps = {
  children: ReactNode;
  params: Promise<{ magazaSlug: string }>;
};

export async function generateMetadata({ params }: StoreLayoutProps): Promise<Metadata> {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) return { title: "Mağaza bulunamadı" };
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
