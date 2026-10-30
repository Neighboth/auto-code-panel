import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Complete per-locale packs.
 *
 * `scripts/i18n-pack-index.mjs` regenerates this file from the `packs/`
 * directory, so adding a language pack never needs a hand-written import.
 * Precedence in `dictionaries.ts`: tr/en → full pack → core pack → English.
 */

export const FULL_PACKS: Record<string, Dictionary> = {
};
