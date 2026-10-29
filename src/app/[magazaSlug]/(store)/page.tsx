import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { ArrowRight, Clock3, Fingerprint, KeyRound, PackageCheck, ShieldCheck, Store } from "lucide-react";
import { db } from "@/db";
import { entitlements, games } from "@/db/schema";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import { GameGrid, type StoreGameCard } from "@/components/store/game-grid";

export const dynamic = "force-dynamic";

export default async function StoreHomePage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const { store } = state;
  const basePath = await getStoreBasePath(store);

  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.storeId, store.id))
    .orderBy(games.createdAt);

  const deliveryCount = await db
    .select({ value: sql<number>`count(*)` })
    .from(entitlements)
    .where(eq(entitlements.storeId, store.id));

  const cards: StoreGameCard[] = gameRows.slice(0, 6).map((game) => ({
    id: game.id,
    title: game.title,
    description: game.description,
    salesUrl: game.salesUrl,
    steamUrl: game.steamUrl,
    originalPrice: game.originalPrice,
    originalCurrency: game.originalCurrency,
    ourPrice: game.ourPrice,
    currency: game.currency,
    coverImage: game.coverImage,
  }));

  const cheapest = gameRows.reduce<string | null>((lowest, game) => {
    const value = Number(game.ourPrice);
    if (!Number.isFinite(value) || value <= 0) return lowest;
    const current = Number(lowest ?? Number.POSITIVE_INFINITY);
    return value < current ? game.ourPrice : lowest;
  }, null);

  return (
    <div>
      <section className="relative overflow-hidden border-b hairline">
        <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
          <div className="fade-up">
            <span className="badge badge-green">
              <span className="live-dot" /> Otomatik teslimat aktif
            </span>
            <h1 className="mt-4 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">
              {store.title}
            </h1>
            <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed muted">{store.subtitle}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link href={`${basePath}/oyunlar`} className="btn btn-primary btn-lg">
                Oyunları keşfet
                <ArrowRight size={15} />
              </Link>
              <Link href={`${basePath}/kod-gir`} className="btn btn-outline btn-lg">
                <KeyRound size={14} />
                Kodumu kullan
              </Link>
            </div>
            <div className="mt-7 grid max-w-md grid-cols-3 gap-4 border-t pt-5 hairline">
              <div>
                <p className="text-[17px] font-semibold tabular-nums">{gameRows.length}</p>
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">Ürün</p>
              </div>
              <div>
                <p className="text-[17px] font-semibold tabular-nums">{deliveryCount[0]?.value ?? 0}</p>
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">Teslimat</p>
              </div>
              <div>
                <p className="text-[17px] font-semibold tabular-nums">
                  {cheapest ? formatMoney(cheapest, "TRY") : "—"}
                </p>
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">Başlangıç</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border hairline">
                  <KeyRound size={15} />
                </span>
                <div>
                  <p className="text-[12.5px] font-semibold">Redeem kodunu gir</p>
                  <p className="text-[10.5px] muted">Teslimat saniyeler içinde</p>
                </div>
              </div>
              <span className="badge">otomatik</span>
            </div>
            <form action={`${basePath}/kod-gir`} method="get" className="mt-4 flex items-center gap-2">
              <input
                name="code"
                placeholder="KEYR-XXXXX-XXXXX"
                className="input mono text-[13px] uppercase tracking-wide"
                required
              />
              <button type="submit" className="btn btn-primary">
                Kullan
              </button>
            </form>
            <div className="mt-4 space-y-2.5 border-t pt-4 hairline">
              {[
                { icon: Fingerprint, title: "Canlı 2FA / Steam Guard", text: "Kodlar backend'de üretilir." },
                { icon: Clock3, title: "Kullanım süresi takibi", text: "Süre kod kullanıldığı an başlar." },
                { icon: ShieldCheck, title: "Güvenli teslimat", text: "Secret anahtarları asla paylaşılmaz." },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2.5">
                  <item.icon size={14} className="mt-0.5 shrink-0 muted" />
                  <div>
                    <p className="text-[12px] font-medium">{item.title}</p>
                    <p className="text-[10.5px] muted">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-11">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Vitrin</p>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em]">Öne çıkan oyunlar</h2>
          </div>
          <Link href={`${basePath}/oyunlar`} className="btn btn-outline btn-sm">
            Tümünü gör
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="mt-5">
          {cards.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center hairline">
              <Store size={22} className="mx-auto muted" />
              <p className="mt-2 text-[13px] font-medium">Henüz ürün eklenmedi</p>
              <p className="mt-1 text-[11.5px] muted">Mağaza yönetimi ürün eklediğinde burada listelenir.</p>
            </div>
          ) : (
            <GameGrid games={cards} />
          )}
        </div>
      </section>

      <section className="border-y hairline">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10 md:grid-cols-3">
          {[
            {
              icon: KeyRound,
              title: "1. Kodunu gir",
              text: "Satın aldığınız redeem kodunu hızlı alandan veya Kod Gir sayfasından girin.",
            },
            {
              icon: PackageCheck,
              title: "2. Ürününü seç",
              text: "Seçmeli kodlarda hakkınız kadar oyunu seçin. Tekli/paket kodlarda seçim otomatik yapılır.",
            },
            {
              icon: Fingerprint,
              title: "3. Hesabına eriş",
              text: "Kütüphanenden hesap bilgilerini kopyala, 2FA/Steam Guard kodunu canlı üret.",
            },
          ].map((step) => (
            <div key={step.title} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border hairline">
                <step.icon size={15} strokeWidth={1.7} />
              </span>
              <div>
                <p className="text-[13px] font-semibold">{step.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed muted">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
