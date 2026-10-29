import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ClockAlert } from "lucide-react";
import { getCustomerSession } from "@/lib/session";
import { getPlatformSettings, getStoreBasePath, getStoreState } from "@/lib/tenant";
import { StoreNav } from "@/components/store/shell";
import { BrandMark } from "@/components/brand";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ magazaSlug: string }>;
}) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const { store, active, expired, suspended } = state;
  const settings = await getPlatformSettings();
  const customerSession = await getCustomerSession();
  const customerName =
    customerSession && customerSession.storeId === store.id ? customerSession.username : null;
  const basePath = await getStoreBasePath(store);

  if (!active) {
    const renewalUrl = store.renewalUrl || settings.renewalUrl;
    return (
      <div className="flex min-h-dvh flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-16 text-center">
          <BrandMark size={34} />
          <span className="badge badge-amber mt-5">
            <ClockAlert size={12} />
            {suspended ? "Askıya alındı" : "Süresi doldu"}
          </span>
          <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.025em] sm:text-[32px]">
            {suspended ? "Mağaza geçici olarak askıda." : "Bayilik süresi dolmuş - askıda."}
          </h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed muted">
            {suspended
              ? "Bu mağaza yönetici tarafından geçici olarak hizmet dışı bırakıldı. Mevcut teslimatlar donduruldu."
              : "Bu mağazanın bayilik süresi sona erdiği için vitrin ve teslimat otomatik olarak durduruldu. Mevcut müşteri kütüphanelerine erişim askıya alındı."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link href={`${basePath}/admin/giris`} className="btn btn-dark">
              Mağaza yönetimi
            </Link>
            <a href={renewalUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
              Süre uzat
              <ArrowUpRight size={13} />
            </a>
          </div>
          <p className="mt-6 text-[11px] muted">
            Mağaza sahibiyseniz yönetim panelinden lisans durumunu görüntüleyebilirsiniz.
          </p>
        </div>
        <footer className="border-t py-5 text-center text-[11px] muted hairline">
          {store.footerText || `${store.name} — ${brand.name} altyapısı`}
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {store.announcement ? (
        <div className="marquee-strip px-4 py-2 text-center text-[11.5px] font-medium tracking-[0.01em]">
          {store.announcement}
        </div>
      ) : null}
      <StoreNav
        slug={store.slug}
        basePath={basePath}
        storeName={store.name}
        logoUrl={store.logoUrl}
        customer={customerName}
      />
      <main className="flex-1">{children}</main>
      <footer className="mt-12 border-t hairline">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-9 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt={store.name} className="h-7 w-7 rounded-md object-cover" />
              ) : (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-bold text-white"
                  style={{ background: "var(--store-primary)" }}
                >
                  {store.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-[13.5px] font-semibold">{store.name}</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed muted">
              {store.footerText || "Dijital oyun ve hesap teslimatı."}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">Mağaza</p>
            <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
              <Link href={basePath || "/"} className="hover:opacity-70">
                Anasayfa
              </Link>
              <Link href={`${basePath}/oyunlar`} className="hover:opacity-70">
                Oyunlar
              </Link>
              <Link href={`${basePath}/kod-gir`} className="hover:opacity-70">
                Kod gir
              </Link>
              <Link href={`${basePath}/kutuphane`} className="hover:opacity-70">
                Kütüphanem
              </Link>
            </div>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">İletişim</p>
            <div className="mt-2 flex flex-col gap-1.5 text-[12px]">
              {store.contactLinks.length === 0 ? <span className="muted">Link eklenmedi</span> : null}
              {store.contactLinks.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:opacity-70"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] muted">Güvenlik</p>
            <p className="mt-2 text-[11.5px] leading-relaxed muted">
              2FA ve Steam Guard kodları sunucu tarafında üretilir. Secret anahtarları tarayıcıya
              gönderilmez.
            </p>
            <p className="mt-2 text-[10.5px] muted">Powered by {brand.name}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
