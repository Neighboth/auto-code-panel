import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { ArrowRight, Clock3, Fingerprint, KeyRound, PackageCheck, ShieldCheck, Store } from "lucide-react";
import { db } from "@/db";
import { entitlements, games } from "@/db/schema";
import { getStoreState, getStoreBasePath } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import { GameGrid, type StoreGameCard } from "@/components/store/game-grid";
import { getTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StoreHomePage({ params }: { params: Promise<{ magazaSlug: string }> }) {
  const { magazaSlug } = await params;
  const state = await getStoreState(magazaSlug);
  if (!state) notFound();
  const { store } = state;
  const basePath = await getStoreBasePath(store);
  const { t } = await getTranslator();

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
              <span className="live-dot" /> {t("home.badge")}
            </span>
            <h1 className="mt-4 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">
              {store.title}
            </h1>
            <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed muted">{store.subtitle}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link href={`${basePath}/oyunlar`} className="btn btn-primary btn-lg">
                {t("home.explore")}
                <ArrowRight size={15} />
              </Link>
              <Link href={`${basePath}/kod-gir`} className="btn btn-outline btn-lg">
                <KeyRound size={14} />
                {t("home.useCode")}
              </Link>
            </div>
            <div className="mt-7 grid max-w-md grid-cols-3 gap-4 border-t pt-5 hairline">
              <div>
                <p className="text-[17px] font-semibold tabular-nums">{gameRows.length}</p>
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">{t("home.products")}</p>
              </div>
              <div>
                <p className="text-[17px] font-semibold tabular-nums">{deliveryCount[0]?.value ?? 0}</p>
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">{t("home.deliveries")}</p>
              </div>
              <div>
                <p className="text-[17px] font-semibold tabular-nums">
                  {cheapest ? formatMoney(cheapest, "TRY") : "—"}
                </p>
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">{t("home.startingAt")}</p>
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
                  <p className="text-[12.5px] font-semibold">{t("home.redeemTitle")}</p>
                  <p className="text-[10.5px] muted">{t("home.redeemSub")}</p>
                </div>
              </div>
              <span className="badge">{t("home.automatic")}</span>
            </div>
            <form action={`${basePath}/kod-gir`} method="get" className="mt-4 flex items-center gap-2">
              <input
                name="code"
                placeholder="KEYR-XXXXX-XXXXX"
                className="input mono text-[13px] uppercase tracking-wide"
                required
              />
              <button type="submit" className="btn btn-primary">
                {t("home.use")}
              </button>
            </form>
            <div className="mt-4 space-y-2.5 border-t pt-4 hairline">
              {[
                { icon: Fingerprint, title: t("home.liveCodes"), text: t("home.liveCodesSub") },
                { icon: Clock3, title: t("home.shared"), text: t("home.sharedSub") },
                { icon: ShieldCheck, title: t("home.secure"), text: t("home.secureSub") },
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
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] muted">{t("home.showcase")}</p>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em]">{t("home.featured")}</h2>
          </div>
          <Link href={`${basePath}/oyunlar`} className="btn btn-outline btn-sm">
            {t("home.viewAll")}
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="mt-5">
          {cards.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center hairline">
              <Store size={22} className="mx-auto muted" />
              <p className="mt-2 text-[13px] font-medium">{t("home.empty")}</p>
              <p className="mt-1 text-[11.5px] muted">{t("home.emptySub")}</p>
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
              title: t("home.step1"),
              text: t("home.step1Text"),
            },
            {
              icon: PackageCheck,
              title: t("home.step2"),
              text: t("home.step2Text"),
            },
            {
              icon: Fingerprint,
              title: t("home.step3"),
              text: t("home.step3Text"),
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
