"use client";
import { useT } from "@/components/i18n-provider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Type } from "lucide-react";
import {
  FONT_CATEGORIES,
  FONT_LIBRARY,
  FONT_LIBRARY_COUNT,
  FONTSHARE_FONTS,
  providerLabel,
  type CatalogFont,
  type FontProvider,
} from "@/lib/fonts";

/**
 * Font catalogue picker.
 *
 * The first version requested a Google Fonts stylesheet for *every* rendered
 * row and re-ran that effect on each keystroke — up to 60 families (10 blocking
 * requests) per character typed. That is what made the settings screen and, via
 * the shared connection pool, the rest of the panel feel frozen.
 *
 * This version:
 * - renders at most `PAGE` rows and filters locally (no network),
 * - asks for a preview only when a row actually scrolls into view
 *   (IntersectionObserver), at most 6 families per request, one request at a
 *   time, and never asks for the same family twice per session,
 * - loads the stylesheet asynchronously (`media="print"` → `all`), so a slow
 *   font CDN can never block paint or input handling.
 */

/** Families whose preview stylesheet has already been requested. */
const requested = new Set<string>();
/** Queued families waiting for the next batch. */
const queue = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = 0;

const HOSTS: Record<FontProvider, string> = {
  google: "https://fonts.googleapis.com/css2",
  fontshare: "https://api.fontshare.com/v2/css",
};

function familyUrl(font: CatalogFont): string {
  if (font.provider === "fontshare") {
    return `${HOSTS.fontshare}?f[]=${font.family.toLowerCase().replace(/\s+/g, "-")}&display=swap`;
  }
  return `${HOSTS.google}?family=${encodeURIComponent(font.family).replace(/%20/g, "+")}&display=swap`;
}

function injectStylesheet(font: CatalogFont) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = familyUrl(font);
  link.media = "print";
  link.dataset.fontPreview = font.family;
  link.onload = () => {
    link.media = "all";
    inflight = Math.max(0, inflight - 1);
  };
  link.onerror = () => {
    // Unknown/removed family: mark it requested so we never retry it in a loop.
    inflight = Math.max(0, inflight - 1);
  };
  document.head.appendChild(link);
  inflight += 1;
}

function flush() {
  flushTimer = null;
  if (inflight >= 2) {
    // Two concurrent sheets at a time is plenty; keep the CPU for input.
    flushTimer = setTimeout(flush, 250);
    return;
  }
  const batch = Array.from(queue).slice(0, 6);
  for (const family of batch) {
    queue.delete(family);
    const font = FONT_LIBRARY.find((item) => item.family === family);
    if (font) injectStylesheet(font);
  }
  if (queue.size > 0) flushTimer = setTimeout(flush, 200);
}

/** Queues a preview stylesheet for `family` (idempotent). */
function requestPreview(family: string) {
  if (requested.has(family)) return;
  requested.add(family);
  queue.add(family);
  if (flushTimer === null) flushTimer = setTimeout(flush, 120);
}

type Filter = "all" | FontProvider;

const PAGE = 60;

export function FontPicker({
  value,
  onChange,
  sample,
}: {
  value: string;
  onChange: (family: string) => void;
  /** Text rendered in the selected family, so the owner sees a real preview. */
  sample: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string>("all");
  /*
   * The extra-page counter is keyed by the current filter, so changing the
   * search term or chips resets it *during render* instead of in an effect
   * (setState-in-effect causes a second render pass and is linted as an error).
   */
  const [paging, setPaging] = useState<{ key: string; limit: number }>({ key: "", limit: PAGE });
  const searchRef = useRef<HTMLInputElement | null>(null);

  // The selected family always needs its stylesheet, even when the list is shut.
  useEffect(() => {
    requestPreview(value);
  }, [value]);

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return FONT_LIBRARY.filter((font) => {
      if (filter !== "all" && font.provider !== filter) return false;
      if (category !== "all" && font.category !== category) return false;
      return needle ? font.family.toLowerCase().includes(needle) : true;
    });
  }, [term, filter, category]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filterKey = `${term}|${filter}|${category}`;
  const limit = paging.key === filterKey ? paging.limit : PAGE;
  const setLimit = (next: number) => setPaging({ key: filterKey, limit: next });
  const visible = results.slice(0, limit);
  const selected = FONT_LIBRARY.find((font) => font.family === value);

  return (
    <div className="rounded-xl border hairline">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Type size={15} className="shrink-0 muted" />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium" style={{ fontFamily: `"${value}", sans-serif` }}>
              {value}
            </span>
            <span className="block text-[10.5px] muted">
              {selected ? `${providerLabel(selected.provider)} · ${selected.category}` : t("x.yaz-tipi")}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-[10.5px] muted">
          {t("x.font-sayisi", { count: FONT_LIBRARY_COUNT })}
        </span>
      </button>

      {open ? (
        <div className="border-t p-3 hairline">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
            <input
              ref={searchRef}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("x.font-ara")}
              className="input h-9 pl-8 text-[12px]"
              autoComplete="off"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", t("x.tumu")],
                ["google", "Google Fonts"],
                ["fontshare", `Fontshare ${FONTSHARE_FONTS.length}`],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className="rounded-full border px-2.5 py-1 text-[10.5px] hairline"
                style={{
                  background: filter === id ? "var(--fg)" : "transparent",
                  color: filter === id ? "var(--bg)" : "inherit",
                }}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
            {["all", ...FONT_CATEGORIES].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className="rounded-full border px-2.5 py-1 text-[10.5px] hairline"
                style={{
                  background: category === item ? "color-mix(in srgb, var(--fg) 12%, transparent)" : "transparent",
                }}
              >
                {item === "all" ? t("x.tumu") : item}
              </button>
            ))}
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg scroll-thin">
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-[11.5px] muted">{t("x.kayt-bulunamad")}</p>
            ) : (
              visible.map((font) => (
                <FontRow
                  key={`${font.provider}:${font.family}`}
                  font={font}
                  active={font.family === value}
                  onPick={() => {
                    onChange(font.family);
                    setOpen(false);
                  }}
                />
              ))
            )}
            {results.length > limit ? (
              <button
                type="button"
                className="mx-1 my-1 w-[calc(100%-8px)] rounded-md border px-2 py-2 text-[11px] hairline muted"
                onClick={() => setLimit(limit + PAGE)}
              >
                {t("x.daha-fazla-goster", { count: results.length - limit })}
              </button>
            ) : null}
          </div>

        </div>
      ) : null}

      <div className="border-t px-3.5 py-3 hairline">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] muted">{t("x.canl-onizleme")}</p>
        <p className="mt-1 text-[18px] font-semibold" style={{ fontFamily: `"${value}", sans-serif` }}>
          {sample}
        </p>
        <p className="text-[12px] muted" style={{ fontFamily: `"${value}", sans-serif` }}>
          {t("x.steam-guard-kodlar-saniyeler-icinde-yenilenir-0123456789")}
        </p>
      </div>
    </div>
  );
}

/** One row; asks for its preview only when it scrolls into view. */
function FontRow({ font, active, onPick }: { font: CatalogFont; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [seen, setSeen] = useState(false);

  const observe = useCallback((node: HTMLButtonElement | null) => {
    ref.current = node;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestPreview(font.family);
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
  }, [font.family]);

  return (
    <button
      ref={observe}
      type="button"
      onClick={onPick}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition hover:opacity-70"
      style={{
        background: active ? "color-mix(in srgb, var(--fg) 6%, transparent)" : "transparent",
      }}
      title={`${font.family} · ${providerLabel(font.provider)}`}
    >
      <span
        className="truncate text-[14px]"
        // Until the sheet lands the system font renders the name — no layout shift
        // because the row height is fixed.
        style={{ fontFamily: seen ? `"${font.family}", sans-serif` : undefined }}
      >
        {font.family}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[9.5px] muted">
        {font.provider === "fontshare" ? (
          <span className="rounded-full border px-1.5 py-0.5 hairline">Fontshare</span>
        ) : null}
        {font.category}
        {active ? <Check size={12} /> : null}
      </span>
    </button>
  );
}
