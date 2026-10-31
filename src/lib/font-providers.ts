/**
 * Font providers and the catalogue the store settings screen offers.
 *
 * Three sources, because one catalogue is never enough:
 *
 * - **Google Fonts** — the complete library (≈1.6 k families), generated into
 *   `font-catalog.ts` by `scripts/fonts.mjs`.
 * - **Fontshare** (Indian Type Foundry) — free-for-commercial-use families that
 *   are *not* on Google (Satoshi, General Sans, Clash Display, Cabinet Grotesk…).
 * - **Upload** — any licensed TTF/OTF/WOFF/WOFF2 the owner already has.
 *
 * Two rendering notes that keep the storefront fast:
 *
 * - a stylesheet is only requested for the family that is actually used, never
 *   for the whole catalogue;
 * - the stylesheet is loaded **asynchronously** (`media="print"` + `onload`
 *   swap). Google Fonts is slow or unreachable in some regions, and a
 *   render-blocking font request there turns every page into a 15-second wait.
 */
import { FONT_CATALOG, FONT_CATEGORIES, FONT_COUNT, FONT_OPTIONS } from "@/lib/font-catalog";

export type FontProvider = "google" | "fontshare";

export type CatalogFont = {
  family: string;
  category: string;
  provider: FontProvider;
  /** Displayed in the picker as a hint ("premium display face", "variable"…). */
  note?: string;
};

/**
 * Fontshare families. The slug is the API identifier
 * (`https://api.fontshare.com/v2/css?f[]=<slug>@400,500,600,700`), which is the
 * lowercase family with spaces removed — the list below is curated, not
 * generated, because Fontshare has no public catalogue endpoint.
 */
const FONTSHARE: { family: string; slug: string; category: string; note?: string }[] = [
  { family: "Satoshi", slug: "satoshi", category: "Sans Serif", note: "variable" },
  { family: "General Sans", slug: "general-sans", category: "Sans Serif", note: "variable" },
  { family: "Switzer", slug: "switzer", category: "Sans Serif", note: "variable" },
  { family: "Cabinet Grotesk", slug: "cabinet-grotesk", category: "Display" },
  { family: "Clash Display", slug: "clash-display", category: "Display" },
  { family: "Clash Grotesk", slug: "clash-grotesk", category: "Display" },
  { family: "Ranade", slug: "ranade", category: "Sans Serif" },
  { family: "Supreme", slug: "supreme", category: "Sans Serif" },
  { family: "Author", slug: "author", category: "Sans Serif" },
  { family: "Alpino", slug: "alpino", category: "Sans Serif" },
  { family: "Amulya", slug: "amulya", category: "Sans Serif" },
  { family: "Chillax", slug: "chillax", category: "Sans Serif" },
  { family: "Rowant", slug: "rowant", category: "Sans Serif" },
  { family: "Nippo", slug: "nippo", category: "Sans Serif" },
  { family: "Pally", slug: "pally", category: "Sans Serif" },
  { family: "Bdo Grotesk", slug: "bdo-grotesk", category: "Sans Serif" },
  { family: "Sentient", slug: "sentient", category: "Serif" },
  { family: "Zodiak", slug: "zodiak", category: "Serif" },
  { family: "Boska", slug: "boska", category: "Serif" },
  { family: "Gambetta", slug: "gambetta", category: "Serif" },
  { family: "Erode", slug: "erode", category: "Serif" },
  { family: "Bespoke Serif", slug: "bespoke-serif", category: "Serif" },
  { family: "Quilon", slug: "quilon", category: "Serif" },
  { family: "Neco", slug: "neco", category: "Serif" },
  { family: "Bonny", slug: "bonny", category: "Serif" },
  { family: "Melodrama", slug: "melodrama", category: "Display" },
  { family: "Tanker", slug: "tanker", category: "Display" },
  { family: "Panchang", slug: "panchang", category: "Display" },
  { family: "Purr", slug: "purr", category: "Display" },
  { family: "Stardom", slug: "stardom", category: "Display" },
  { family: "Array", slug: "array", category: "Display" },
  { family: "Sharpie", slug: "sharpie", category: "Display" },
  { family: "Bespoke Sans", slug: "bespoke-sans", category: "Sans Serif" },
];

const FONTSHARE_SLUG = new Map(FONTSHARE.map((font) => [font.family, font.slug]));

export const FONTSHARE_FONTS: CatalogFont[] = FONTSHARE.map((font) => ({
  family: font.family,
  category: font.category,
  provider: "fontshare",
  note: font.note,
}));

/** Google families first, then the Fontshare additions — one flat list. */
export const FONT_LIBRARY: CatalogFont[] = [
  ...FONT_CATALOG.map((font) => ({
    family: font.family,
    category: font.category,
    provider: "google" as const,
    note: font.turkish ? undefined : "latin only",
  })),
  ...FONTSHARE_FONTS,
];

export const FONT_LIBRARY_COUNT = FONT_LIBRARY.length;

/** Every family the panel may store — Google *and* Fontshare. */
export const FONT_FAMILIES = new Set(FONT_LIBRARY.map((font) => font.family));

/**
 * Server-side validation helper.
 *
 * The old check compared against the Google-only catalogue, so switching a store
 * to a Fontshare family was rejected by the action even though the picker
 * offered it.
 */
export function isSupportedFont(family: string): boolean {
  return FONT_FAMILIES.has(family);
}

export { FONT_CATEGORIES, FONT_COUNT, FONT_OPTIONS };
export type { FontOption } from "@/lib/font-catalog";

export function fontProvider(family: string): FontProvider {
  return FONTSHARE_SLUG.has(family) ? "fontshare" : "google";
}

/** Google Fonts CSS2 URL for up to 6 families (no weight axis: see below). */
export function googleFontHref(families: string[]): string {
  const unique = Array.from(new Set(families.filter((family) => family && fontProvider(family) === "google"))).slice(0, 6);
  if (unique.length === 0) return "";
  const params = unique
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, "+")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** Fontshare CSS URL for up to 6 families. */
export function fontshareHref(families: string[]): string {
  const unique = Array.from(new Set(families.filter((family) => fontProvider(family) === "fontshare"))).slice(0, 6);
  if (unique.length === 0) return "";
  const params = unique.map((family) => `f[]=${FONTSHARE_SLUG.get(family) ?? family.toLowerCase()}`).join("&");
  return `https://api.fontshare.com/v2/css?${params}&display=swap`;
}

/**
 * Stylesheet for a single family regardless of provider.
 *
 * `weightAxis` exists because the Google CSS2 endpoint answers **400** when a
 * face is asked for weights it does not ship; omitting the axis returns whatever
 * the family actually has.
 */
export function familyStylesheet(family: string): string {
  if (!family) return "";
  return fontProvider(family) === "fontshare" ? fontshareHref([family]) : googleFontHref([family]);
}

/** Every stylesheet needed to preview `families` (max 6 per request). */
export function previewStylesheets(families: string[]): string[] {
  const google = googleFontHref(families);
  const share = fontshareHref(families);
  return [google, share].filter(Boolean);
}

/**
 * Paths Fontshare has no separate catalogue for: the picker labels them so the
 * owner knows the font comes from a different foundry.
 */
export function providerLabel(provider: FontProvider): string {
  return provider === "fontshare" ? "Fontshare" : "Google Fonts";
}
