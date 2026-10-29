import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { requireStoreAdmin } from "@/lib/tenant";
import { GameManager, type AdminGame } from "@/components/admin/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oyunlar & Ürünler" };

export default async function AdminGamesPage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const guard = await requireStoreAdmin(magazaSlug);
  if (!guard) notFound();

  const rows = await db
    .select()
    .from(games)
    .where(eq(games.storeId, guard.state.store.id))
    .orderBy(desc(games.createdAt));

  const list: AdminGame[] = rows.map((game) => ({
    id: game.id,
    title: game.title,
    description: game.description,
    salesUrl: game.salesUrl,
    steamUrl: game.steamUrl,
    steamAppId: game.steamAppId,
    originalPrice: game.originalPrice,
    originalCurrency: game.originalCurrency,
    ourPrice: game.ourPrice,
    currency: game.currency,
    coverImage: game.coverImage,
    autoSync: game.autoSync,
    lastSyncedAt: game.lastSyncedAt ? new Date(game.lastSyncedAt).toISOString() : null,
  }));

  return <GameManager slug={guard.state.store.slug} games={list} />;
}
