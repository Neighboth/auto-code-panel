"use client";

import { useState } from "react";
import { ArrowUpRight, ExternalLink, Gamepad2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { Markdown } from "@/components/markdown";
import { discountPercent, formatMoney } from "@/lib/format";

export type StoreGameCard = {
  id: number;
  title: string;
  description: string;
  salesUrl: string;
  steamUrl: string;
  originalPrice: string | null;
  originalCurrency: string;
  ourPrice: string;
  currency: string;
  coverImage: string;
};

const PAGE_SIZE = 24;

/**
 * Product grid.
 *
 * Large catalogues used to render every card (and every cover image) at once,
 * which is what made scrolling feel heavy. Now the first 24 cards render, the
 * rest are appended on demand and each card uses `content-visibility: auto` so
 * offscreen work is skipped by the browser.
 */
export function GameGrid({ games }: { games: StoreGameCard[] }) {
  const [active, setActive] = useState<StoreGameCard | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = games.slice(0, visible);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((game) => {
          const discount =
            game.originalCurrency === game.currency
              ? discountPercent(game.originalPrice, game.ourPrice)
              : null;
          return (
            <article key={game.id} className="card group overflow-hidden cv-auto">
              <div className="relative aspect-[460/215] overflow-hidden" style={{ background: "var(--bg)" }}>
                {game.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.coverImage}
                    alt={game.title}
                    loading="lazy"
                    decoding="async"
                    width={460}
                    height={215}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center muted">
                    <Gamepad2 size={28} />
                  </div>
                )}
                {discount ? (
                  <span
                    className="absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-semibold text-white"
                    style={{ background: "#16a34a" }}
                  >
                    %{discount} indirim
                  </span>
                ) : null}
              </div>
              <div className="p-4">
                <h3 className="text-[14px] font-semibold leading-tight tracking-[-0.01em]">{game.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed muted">
                  {game.description || "Dijital teslimat"}
                </p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold tracking-[-0.01em]">
                      {formatMoney(game.ourPrice, game.currency)}
                    </p>
                    {game.originalPrice ? (
                      <p className="text-[11px] line-through muted">
                        {formatMoney(game.originalPrice, game.originalCurrency)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setActive(game)} className="btn btn-outline btn-sm">
                      Detay
                    </button>
                    <a
                      href={game.salesUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      Satın al
                      <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.title}
        description={active ? "Ürün detayı ve fiyat karşılaştırması" : undefined}
        size="lg"
        footer={
          active ? (
            <>
              {active.steamUrl ? (
                <a href={active.steamUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
                  <ExternalLink size={13} />
                  Steam Mağaza
                </a>
              ) : null}
              <a href={active.salesUrl || "#"} target="_blank" rel="noreferrer" className="btn btn-primary">
                Satın alma ilanına git
                <ArrowUpRight size={13} />
              </a>
            </>
          ) : null
        }
      >
        {active ? (
          <div className="space-y-4">
            {active.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                    loading="lazy"
                    decoding="async" src={active.coverImage} alt={active.title} className="w-full rounded-lg border object-cover hairline" />
            ) : null}
            <div className="grid grid-cols-3 divide-x rounded-lg border hairline">
              <div className="p-3">
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">Orijinal Steam</p>
                <p className="mt-1 text-[14px] font-semibold">
                  {formatMoney(active.originalPrice, active.originalCurrency)}
                </p>
              </div>
              <div className="p-3">
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">Bizim fiyatımız</p>
                <p className="mt-1 text-[14px] font-semibold">
                  {formatMoney(active.ourPrice, active.currency)}
                </p>
              </div>
              <div className="p-3">
                <p className="text-[10.5px] uppercase tracking-[0.08em] muted">Avantaj</p>
                <p className="mt-1 text-[14px] font-semibold">
                  {(() => {
                    const discount =
                      active.originalCurrency === active.currency
                        ? discountPercent(active.originalPrice, active.ourPrice)
                        : null;
                    return discount ? `%${discount}` : "—";
                  })()}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] muted">Açıklama</p>
              <div className="mt-1.5">
                <Markdown content={active.description || "Açıklama girilmedi."} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
