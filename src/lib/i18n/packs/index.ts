import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Complete per-locale packs.
 *
 * `scripts/i18n-pack-index.mjs` regenerates this file from the `packs/`
 * directory, so adding a language pack never needs a hand-written import.
 * Precedence in `dictionaries.ts`: tr/en → full pack → core pack → English.
 */
import arPack from "./ar.json";
import bgPack from "./bg.json";
import bnPack from "./bn.json";
import bsPack from "./bs.json";
import caPack from "./ca.json";
import coveragePack from "./coverage.json";
import csPack from "./cs.json";
import daPack from "./da.json";
import dePack from "./de.json";
import elPack from "./el.json";
import esPack from "./es.json";
import etPack from "./et.json";
import euPack from "./eu.json";
import faPack from "./fa.json";
import fiPack from "./fi.json";
import frPack from "./fr.json";
import gaPack from "./ga.json";
import glPack from "./gl.json";
import guPack from "./gu.json";
import hePack from "./he.json";
import hiPack from "./hi.json";
import hrPack from "./hr.json";
import huPack from "./hu.json";
import isPack from "./is.json";
import itPack from "./it.json";
import lbPack from "./lb.json";
import ltPack from "./lt.json";
import lvPack from "./lv.json";
import mkPack from "./mk.json";
import mrPack from "./mr.json";
import mtPack from "./mt.json";
import nePack from "./ne.json";
import nlPack from "./nl.json";
import noPack from "./no.json";
import paPack from "./pa.json";
import plPack from "./pl.json";
import ptPack from "./pt.json";
import roPack from "./ro.json";
import ruPack from "./ru.json";
import skPack from "./sk.json";
import slPack from "./sl.json";
import sqPack from "./sq.json";
import srPack from "./sr.json";
import svPack from "./sv.json";
import taPack from "./ta.json";
import tePack from "./te.json";
import ukPack from "./uk.json";
import urPack from "./ur.json";

export const FULL_PACKS: Record<string, Dictionary> = {
  "ar": arPack as Dictionary,
  "bg": bgPack as Dictionary,
  "bn": bnPack as Dictionary,
  "bs": bsPack as Dictionary,
  "ca": caPack as Dictionary,
  "coverage": coveragePack as Dictionary,
  "cs": csPack as Dictionary,
  "da": daPack as Dictionary,
  "de": dePack as Dictionary,
  "el": elPack as Dictionary,
  "es": esPack as Dictionary,
  "et": etPack as Dictionary,
  "eu": euPack as Dictionary,
  "fa": faPack as Dictionary,
  "fi": fiPack as Dictionary,
  "fr": frPack as Dictionary,
  "ga": gaPack as Dictionary,
  "gl": glPack as Dictionary,
  "gu": guPack as Dictionary,
  "he": hePack as Dictionary,
  "hi": hiPack as Dictionary,
  "hr": hrPack as Dictionary,
  "hu": huPack as Dictionary,
  "is": isPack as Dictionary,
  "it": itPack as Dictionary,
  "lb": lbPack as Dictionary,
  "lt": ltPack as Dictionary,
  "lv": lvPack as Dictionary,
  "mk": mkPack as Dictionary,
  "mr": mrPack as Dictionary,
  "mt": mtPack as Dictionary,
  "ne": nePack as Dictionary,
  "nl": nlPack as Dictionary,
  "no": noPack as Dictionary,
  "pa": paPack as Dictionary,
  "pl": plPack as Dictionary,
  "pt": ptPack as Dictionary,
  "ro": roPack as Dictionary,
  "ru": ruPack as Dictionary,
  "sk": skPack as Dictionary,
  "sl": slPack as Dictionary,
  "sq": sqPack as Dictionary,
  "sr": srPack as Dictionary,
  "sv": svPack as Dictionary,
  "ta": taPack as Dictionary,
  "te": tePack as Dictionary,
  "uk": ukPack as Dictionary,
  "ur": urPack as Dictionary,
};
