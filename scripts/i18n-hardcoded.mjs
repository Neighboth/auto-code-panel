#!/usr/bin/env node
/**
 * i18n hardcoded-text audit.
 *
 * Counts Turkish text that is still written directly in JSX (element children,
 * aria-labels, placeholders, titles) instead of going through the dictionary.
 * Run with `npm run i18n:hardcoded` — the script never fails the build, it only
 * reports so the remaining work stays visible and measurable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SKIP_DIRS = new Set(["node_modules", ".next", "i18n"]);
const EXT = new Set([".ts", ".tsx"]);

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const PATTERNS = [
  />\s*([^<>{}]*[çğıöşüÇĞİÖŞÜ][^<>{}]*?)\s*</g,
  /(?:aria-label|placeholder|title|alt|label)\s*=\s*"([^"]*[çğıöşüÇĞİÖŞÜ][^"]*)"/g,
  /(?:toast\.(?:success|error|info|warning)|setError)\(\s*"([^"]*[çğıöşüÇĞİÖŞÜ][^"]*)"/g,
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else if (EXT.has(full.slice(full.lastIndexOf(".")))) {
      yield full;
    }
  }
}

const files = [];
let total = 0;
for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  if (!TURKISH.test(source)) continue;
  const hits = [];
  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const text = match[1].trim();
      if (!text || text.length < 2) continue;
      if (/^[a-z-]+$/.test(text) || text.includes("className")) continue;
      hits.push(text);
    }
  }
  if (!hits.length) continue;
  const unique = [...new Set(hits)];
  total += unique.length;
  files.push({ file: relative(ROOT, file), count: unique.length, samples: unique.slice(0, 3) });
}

files.sort((a, b) => b.count - a.count);
const json = process.argv.includes("--json");

if (json) {
  console.log(JSON.stringify({ total, files }, null, 2));
} else {
  console.log(`Sabit (çevrilmemiş) Türkçe metin: ${total} · dosya: ${files.length}`);
  for (const row of files) {
    console.log(`  ${String(row.count).padStart(3)}  ${row.file}`);
    console.log(`        ör: ${row.samples.join(" · ")}`);
  }
  console.log(
    "\nNot: bu metinler tr/en sözlüğüne taşınmalı. Yeni anahtarlar `src/lib/i18n/dictionaries.ts` içine eklenir.",
  );
}
