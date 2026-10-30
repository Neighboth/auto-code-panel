import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Complete per-locale packs.
 *
 * `scripts/i18n-pack-index.mjs` regenerates this file from the `packs/`
 * directory, so adding a language pack never needs a hand-written import.
 * Precedence in `dictionaries.ts`: tr/en → full pack → core pack → English.
 */
import bgPack from "./bg.json";
import bsPack from "./bs.json";
import caPack from "./ca.json";
import coveragePack from "./coverage.json";
import csPack from "./cs.json";
import daPack from "./da.json";
import dePack from "./de.json";
import elPack from "./el.json";
import esPack from "./es.json";
import etPack from "./et.json";
import fiPack from "./fi.json";
import frPack from "./fr.json";
import gaPack from "./ga.json";
import hrPack from "./hr.json";
import huPack from "./hu.json";
import isPack from "./is.json";
import itPack from "./it.json";
import ltPack from "./lt.json";
import lvPack from "./lv.json";
import mkPack from "./mk.json";
import nlPack from "./nl.json";
import noPack from "./no.json";
import plPack from "./pl.json";
import ptPack from "./pt.json";
import roPack from "./ro.json";
import ruPack from "./ru.json";
import skPack from "./sk.json";
import slPack from "./sl.json";
import sqPack from "./sq.json";
import srPack from "./sr.json";
import svPack from "./sv.json";
import ukPack from "./uk.json";

export const FULL_PACKS: Record<string, Dictionary> = {
  "bg": bgPack as Dictionary,
  "bs": bsPack as Dictionary,
  "ca": caPack as Dictionary,
  "coverage": coveragePack as Dictionary,
  "cs": csPack as Dictionary,
  "da": daPack as Dictionary,
  "de": dePack as Dictionary,
  "el": elPack as Dictionary,
  "es": esPack as Dictionary,
  "et": etPack as Dictionary,
  "fi": fiPack as Dictionary,
  "fr": frPack as Dictionary,
  "ga": gaPack as Dictionary,
  "hr": hrPack as Dictionary,
  "hu": huPack as Dictionary,
  "is": isPack as Dictionary,
  "it": itPack as Dictionary,
  "lt": ltPack as Dictionary,
  "lv": lvPack as Dictionary,
  "mk": mkPack as Dictionary,
  "nl": nlPack as Dictionary,
  "no": noPack as Dictionary,
  "pl": plPack as Dictionary,
  "pt": ptPack as Dictionary,
  "ro": roPack as Dictionary,
  "ru": ruPack as Dictionary,
  "sk": skPack as Dictionary,
  "sl": slPack as Dictionary,
  "sq": sqPack as Dictionary,
  "sr": srPack as Dictionary,
  "sv": svPack as Dictionary,
  "uk": ukPack as Dictionary,
};
