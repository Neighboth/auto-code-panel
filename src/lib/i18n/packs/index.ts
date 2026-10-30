import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Complete per-locale packs.
 *
 * `scripts/i18n-pack-index.mjs` regenerates this file from the `packs/`
 * directory, so adding a language pack never needs a hand-written import.
 * Precedence in `dictionaries.ts`: tr/en → full pack → core pack → English.
 */
import coveragePack from "./coverage.json";
import csPack from "./cs.json";
import dePack from "./de.json";
import esPack from "./es.json";
import frPack from "./fr.json";
import itPack from "./it.json";
import nlPack from "./nl.json";
import plPack from "./pl.json";
import ptPack from "./pt.json";
import ruPack from "./ru.json";
import ukPack from "./uk.json";

export const FULL_PACKS: Record<string, Dictionary> = {
  "coverage": coveragePack as Dictionary,
  "cs": csPack as Dictionary,
  "de": dePack as Dictionary,
  "es": esPack as Dictionary,
  "fr": frPack as Dictionary,
  "it": itPack as Dictionary,
  "nl": nlPack as Dictionary,
  "pl": plPack as Dictionary,
  "pt": ptPack as Dictionary,
  "ru": ruPack as Dictionary,
  "uk": ukPack as Dictionary,
};
