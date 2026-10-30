#!/usr/bin/env node
/**
 * Verifies the machine-translated packs.
 *
 * Checks, per locale:
 *   - every reference key is present (nothing silently missing),
 *   - the pack is not just the English source text (a failed run),
 *   - `{placeholder}` sets survived translation,
 *   - values are non-empty and free of raw dictionary keys.
 *
 * Run with `npm run i18n:verify`. Exits 1 when any locale fails, so it can be a
 * CI gate next to `i18n:check`.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PACK_DIR = join(ROOT, "src", "lib", "i18n", "packs");

function objectEntries(source) {
  const map = {};
  for (const match of source.matchAll(/"([^"\n]+)"\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
    try {
      map[match[1]] = JSON.parse(match[2]);
    } catch {
      /* ignore malformed rows */
    }
  }
  return map;
}

const block = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = endMarker ? source.indexOf(endMarker, start) : -1;
  return source.slice(start, end < 0 ? undefined : end);
};

const dictSource = readFileSync(join(ROOT, "src", "lib", "i18n", "dictionaries.ts"), "utf8");
const extraSource = readFileSync(join(ROOT, "src", "lib", "i18n", "ui-extra.ts"), "utf8");
const configSource = readFileSync(join(ROOT, "src", "lib", "i18n", "config.ts"), "utf8");

const en = {
  ...objectEntries(block(dictSource, "const en: Dictionary = {", "const short:")),
  ...objectEntries(block(extraSource, "export const EXTRA_EN")),
};
const tr = {
  ...objectEntries(block(dictSource, "const tr: Dictionary = {", "const en: Dictionary = {")),
  ...objectEntries(block(extraSource, "export const EXTRA_TR", "export const EXTRA_EN")),
};

const resolve = (value, dict) => {
  if (!value) return "";
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/.test(value)) {
    const inline = dict[value];
    if (inline && inline !== value) return resolve(inline, dict);
  }
  return value;
};

const referenceKeys = Object.keys(tr);
const englishFor = (key) => resolve(en[key], en) || resolve(tr[key], tr);
const locales = [...new Set([...configSource.matchAll(/code:\s*"([a-z]{2,3})"/g)].map((m) => m[1]))].filter(
  (code) => code !== "tr" && code !== "en",
);

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;
const sortedTokens = (text) => (text.match(PLACEHOLDER) ?? []).sort();

const rows = [];
for (const code of locales) {
  const file = join(PACK_DIR, `${code}.json`);
  if (!existsSync(file)) {
    rows.push({ code, status: "missing", count: 0, untranslatedRatio: 1, notes: ["paket yok"] });
    continue;
  }
  let pack = {};
  try {
    pack = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    rows.push({ code, status: "broken", count: 0, untranslatedRatio: 1, notes: [String(error.message)] });
    continue;
  }

  const missing = referenceKeys.filter((key) => !pack[key]);
  const notes = [];
  if (missing.length) notes.push(`${missing.length} anahtar eksik (ör. ${missing.slice(0, 3).join(", ")})`);

  let compared = 0;
  let identical = 0;
  let placeholderIssues = 0;
  let rawKeys = 0;
  for (const key of referenceKeys) {
    const value = pack[key];
    if (!value) continue;
    const source = englishFor(key);
    if (source && value === source) {
      identical += 1;
      compared += 1;
    } else if (source) {
      compared += 1;
      if (sortedTokens(source).join("|") !== sortedTokens(value).join("|")) placeholderIssues += 1;
    }
    if (/^x\.[a-z0-9-]+$/.test(value)) rawKeys += 1;
  }
  const ratio = compared ? identical / compared : 1;
  if (placeholderIssues) notes.push(`${placeholderIssues} placeholder uyumsuz`);
  if (rawKeys) notes.push(`${rawKeys} ham anahtar`);
  if (ratio > 0.6) notes.push("İngilizce metin oranı yüksek");

  const status = notes.length === 0 && missing.length === 0 ? "ok" : ratio > 0.6 ? "untranslated" : "warn";
  rows.push({ code, status, count: Object.keys(pack).length, untranslatedRatio: Number(ratio.toFixed(2)), notes });
}

const byStatus = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
console.log(
  `Paketler: ${rows.length} dil · referans ${referenceKeys.length} anahtar · ` +
    Object.entries(byStatus)
      .map(([status, count]) => `${status}: ${count}`)
      .join(" · "),
);
for (const row of rows.filter((item) => item.status !== "ok")) {
  console.log(`  ${row.code.padEnd(4)} ${row.status.padEnd(12)} ${String(row.count).padStart(5)} anahtar · ${row.notes.join("; ")}`);
}
if ((byStatus.ok ?? 0) !== rows.length) process.exitCode = 1;
