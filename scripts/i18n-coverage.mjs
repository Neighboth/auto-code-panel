#!/usr/bin/env node
/**
 * Prints translation coverage for every locale.
 *
 * Reference = Turkish dictionary. Statuses:
 *   full    – defines every reference key
 *   core    – ships the complete customer-facing core pack (see CORE_KEYS)
 *   partial – only the legacy seed keys
 *   english – no own dictionary, falls back to English
 *
 * Usage: npm run i18n:coverage [-- --json]
 */
import fs from "node:fs";
import path from "node:path";

const dictFile = path.join("src", "lib", "i18n", "dictionaries.ts");
const packFile = path.join("src", "lib", "i18n", "core-packs.ts");
const extraFile = path.join("src", "lib", "i18n", "ui-extra.ts");
const packDir = path.join("src", "lib", "i18n", "packs");
const configFile = path.join("src", "lib", "i18n", "config.ts");

const dict = fs.readFileSync(dictFile, "utf8");
const packs = fs.readFileSync(packFile, "utf8");
const config = fs.readFileSync(configFile, "utf8");
const extra = fs.readFileSync(extraFile, "utf8");

const keysIn = (block) => new Set([...block.matchAll(/"([a-zA-Z][a-zA-Z0-9._-]*)"\s*:/g)].map((m) => m[1]));

const trBlock = dict.slice(dict.indexOf("const tr: Dictionary = {"), dict.indexOf("const en: Dictionary = {"));
const enBlock = dict.slice(dict.indexOf("const en: Dictionary = {"), dict.indexOf("const short:"));
const shortBlock = dict.slice(dict.indexOf("const short:"), dict.indexOf("export const DICTIONARIES"));
const extraTr = keysIn(extra.slice(extra.indexOf("export const EXTRA_TR"), extra.indexOf("export const EXTRA_EN")));
const extraEn = keysIn(extra.slice(extra.indexOf("export const EXTRA_EN")));
const trKeys = new Set([...keysIn(trBlock), ...extraTr]);
const enKeys = new Set([...keysIn(enBlock), ...extraEn]);

const coreBlock = packs.slice(packs.indexOf("export const CORE_KEYS"), packs.indexOf("export const UI_PACKS"));
const coreKeys = new Set([...coreBlock.matchAll(/"([a-zA-Z][a-zA-Z0-9._-]*)"/g)].map((m) => m[1]));

const packBlocks = new Map();
const packsSection = packs.slice(packs.indexOf("export const UI_PACKS"));
for (const match of packsSection.matchAll(/^ {2}([a-z]{2,3}):\s*\{([\s\S]*?)^ {2}\},?$/gm)) {
  packBlocks.set(match[1], keysIn(match[2]));
}

// Machine-translated packs (written by scripts/i18n-translate.mjs) count fully.
const fullPacks = new Map();
if (fs.existsSync(packDir)) {
  for (const file of fs.readdirSync(packDir).filter((name) => name.endsWith(".json") && name !== "coverage.json")) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(packDir, file), "utf8"));
      fullPacks.set(file.replace(/\.json$/, ""), new Set(Object.keys(parsed)));
    } catch {
      /* a half-written pack is simply ignored */
    }
  }
}

const shortLangs = new Set([...shortBlock.matchAll(/^ {2}([a-z]{2,3}):\s*\{/gm)].map((m) => m[1]));
const locales = [...new Set([...config.matchAll(/code:\s*"([a-z]{2,3})"/g)].map((m) => m[1]))];

const rows = locales.map((code) => {
  const full = fullPacks.get(code);
  const pack = new Set([...(packBlocks.get(code) ?? []), ...(full ?? [])]);
  const seeded = shortLangs.has(code) ? 13 : 0;
  const own = code === "tr" ? trKeys.size : code === "en" ? enKeys.size : Math.max(pack.size, seeded);
  const core = code === "tr" || code === "en" ? coreKeys.size : [...coreKeys].filter((key) => pack.has(key)).length;
  const status = own >= trKeys.size ? "full" : core >= coreKeys.size ? "core" : own > 0 ? "partial" : "english";
  return { code, own, core, status };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ referenceKeys: trKeys.size, coreKeys: coreKeys.size, rows }, null, 2));
} else {
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  console.log(`Referans (tr): ${trKeys.size} anahtar · çekirdek paket: ${coreKeys.size} anahtar`);
  console.log(
    `Diller: ${rows.length} · tam: ${counts.full ?? 0} · çekirdek: ${counts.core ?? 0} · kısmi: ${counts.partial ?? 0} · İngilizce: ${counts.english ?? 0}`,
  );
  for (const row of rows.sort((a, b) => b.own - a.own)) {
    console.log(
      `${row.code.padEnd(4)} ${String(row.own).padStart(4)}/${trKeys.size}  core ${String(row.core).padStart(2)}/${coreKeys.size}  ${row.status}`,
    );
  }
}
