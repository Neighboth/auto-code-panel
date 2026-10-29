import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getStoreState } from "@/lib/tenant";
import { GameGrid, type StoreGameCard } from "@/components/store/game-grid";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oyunlar" };

export default async function StoreGamesPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { t } = await getTranslator();
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const { store } = state;

  const rows = await db
    .select()
    .from(games)
    .where(eq(games.storeId, store.id))
    .orderBy(games.createdAt);

  const cards: StoreGameCard[] = rows.map((game) => ({
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

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-9">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5 hairline">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">Katalog</p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.025em]">{" "}{t("x.oyunlar-urunler")}</h1>
          <p className="mt-1 text-[12.5px] muted">
            {t("x.count-urun-listeleniyor-satn-alma-islemleri-magaza-ilan-", { count: rows.length })}
          </p>
        </div>
        <span className="badge badge-blue">{" "}{t("x.steam-fiyatlar-referans-alnr")}</span>
      </div>
      <div className="mt-6">
        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center hairline">
            <p className="text-[13px] font-medium">{" "}{t("x.katalog-henuz-bos")}</p>
            <p className="mt-1 text-[11.5px] muted">{" "}{t("x.magaza-yonetimi-urun-eklediginde-burada-gorunecek")}</p>
          </div>
        ) : (
          <GameGrid games={cards} />
        )}
      </div>
    </div>
  );
}
