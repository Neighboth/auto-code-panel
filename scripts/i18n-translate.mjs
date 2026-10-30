#!/usr/bin/env node
/**
 * Machine-translates the whole UI dictionary into every supported locale.
 *
 * Output: `src/lib/i18n/packs/<code>.json`, one flat object per locale that
 * `scripts/i18n-pack-index.mjs` turns into a static import map.
 *
 * Design notes
 * ------------
 * - The source of truth is English (the `en` dictionary); Turkish is used for
 *   keys that only exist in the reference dictionary. Values that are aliases
 *   (`"common.unlimited": "x.snrsz"`) are resolved to their text first, so a
 *   pack never contains a raw key.
 * - Google's public `translate_a/single` endpoint is used because it needs no
 *   API key, which keeps the job runnable from a plain GitHub runner. Strings
 *   are joined with newlines and split apart again; whenever the line count does
 *   not match, the chunk falls back to one request per string.
 * - Placeholders (`{count}`, `{name}`) must survive unchanged. A string that
 *   loses one is retried alone and finally falls back to English, so a broken
 *   translation can never print `{count}` nor crash `.replace()`.
 * - Locales that already have a pack are skipped unless `--force` is passed,
 *   which makes a crashed run resumable: rerun and only the missing locales are
 *   translated again.
 *
 * Usage:
 *   node scripts/i18n-translate.mjs --locales=all --concurrency=6
 *   node scripts/i18n-translate.mjs --locales=de,fr --limit=50 --force
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PACK_DIR = join(ROOT, "src", "lib", "i18n", "packs");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const CONCURRENCY = Math.max(1, Math.min(16, Number(args.concurrency ?? 6)));
const LIMIT = args.limit ? Number(args.limit) : 0;
const FORCE = args.force === "true";
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

/* ------------------------------------------------------------------ source */

/** Pulls `"key": "value"` pairs out of a TS object literal without running it. */
function objectEntries(source) {
  const map = {};
  for (const match of source.matchAll(/"([^"\n]+)"\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
    try {
      map[match[1]] = JSON.parse(match[2]);
    } catch {
      /* a malformed row is simply skipped — the key stays untranslated */
    }
  }
  return map;
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = endMarker ? source.indexOf(endMarker, start) : -1;
  return source.slice(start, end < 0 ? undefined : end);
}

const dictSource = readFileSync(join(ROOT, "src", "lib", "i18n", "dictionaries.ts"), "utf8");
const extraSource = readFileSync(join(ROOT, "src", "lib", "i18n", "ui-extra.ts"), "utf8");
const configSource = readFileSync(join(ROOT, "src", "lib", "i18n", "config.ts"), "utf8");
const coreSource = readFileSync(join(ROOT, "src", "lib", "i18n", "core-packs.ts"), "utf8");

const tr = {
  ...objectEntries(block(dictSource, "const tr: Dictionary = {", "const en: Dictionary = {")),
  ...objectEntries(block(extraSource, "export const EXTRA_TR", "export const EXTRA_EN")),
};
const en = {
  ...objectEntries(block(dictSource, "const en: Dictionary = {", "const short:")),
  ...objectEntries(block(extraSource, "export const EXTRA_EN")),
};

/** Resolves `"x.snrsz"`-style aliases to the readable text. */
function resolveText(value, dict, other) {
  if (!value) return "";
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/.test(value)) {
    const inline = dict[value] ?? other[value];
    if (inline && inline !== value) return resolveText(inline, dict, other);
  }
  return value;
}

const referenceKeys = Object.keys(tr);
const sourceOf = new Map(); // key -> { text, lang }
for (const key of referenceKeys) {
  const english = resolveText(en[key], en, tr);
  const turkish = resolveText(tr[key], tr, en);
  if (english) sourceOf.set(key, { text: english, lang: "en" });
  else if (turkish) sourceOf.set(key, { text: turkish, lang: "tr" });
}

/** Core packs are hand-written; they win over machine output. */
const corePacks = new Map();
for (const match of coreSource
  .slice(coreSource.indexOf("export const UI_PACKS"))
  .matchAll(/^ {2}([a-z]{2,3}):\s*\{([\s\S]*?)^ {2}\},?$/gm)) {
  corePacks.set(match[1], objectEntries(match[2]));
}
const shortPacks = new Map();
for (const match of block(dictSource, "const short:", "export const DICTIONARIES").matchAll(
  /^ {2}([a-z]{2,3}):\s*\{([\s\S]*?)^ {2}\},?$/gm,
)) {
  shortPacks.set(match[1], objectEntries(match[2]));
}

const locales = [...new Set([...configSource.matchAll(/code:\s*"([a-z]{2,3})"/g)].map((m) => m[1]))].filter(
  (code) => code !== "tr" && code !== "en",
);

/* --------------------------------------------------------------- transport */

/** Google speaks a few language codes differently from ISO-639-1. */
const GOOGLE_CODE = { zh: "zh-CN", fil: "tl", no: "nb", he: "iw", jv: "jw" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(text, from, to, attempt = 0) {
  const url =
    `${ENDPOINT}?client=gtx&sl=${GOOGLE_CODE[from] ?? from}&tl=${GOOGLE_CODE[to] ?? to}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
    const joined = segments.map((segment) => (Array.isArray(segment) ? segment[0] ?? "" : "")).join("");
    if (!joined.trim()) throw new Error("empty translation");
    return joined;
  } catch (error) {
    if (attempt >= 5) throw error;
    // 429s mean the runner is being throttled: back off harder than a normal error.
    const base = String(error?.message ?? "").includes("429") ? 4000 : 800;
    await sleep(base * 2 ** attempt + Math.random() * 400);
    return request(text, from, to, attempt + 1);
  }
}

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;
const placeholders = (text) => (text.match(PLACEHOLDER) ?? []).sort();

function keepPlaceholders(source, translated) {
  const expected = placeholders(source);
  const actual = placeholders(translated);
  if (expected.length !== actual.length) return false;
  return expected.every((token, index) => token === actual[index]);
}

/** Strings that are only brands, codes or symbols are copied verbatim. */
const needsTranslation = (text) => /[A-Za-zÀ-ÿ\u00c0-\u024f\u0400-\u04ff\u0600-\u06ff\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text) && text.length > 1;

/**
 * Translates a batch of strings by joining them with newlines. Returns one
 * translation per input; `null` marks the ones that need an individual retry.
 */
async function translateBatch(texts, from, to) {
  const joined = texts.join("\n");
  const translated = await request(joined, from, to);
  const lines = translated.split("\n");
  // Trailing newline handling: Google keeps the count when every line ends with one.
  while (lines.length > texts.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length !== texts.length) return texts.map(() => null);
  return lines.map((line, index) => (keepPlaceholders(texts[index], line.trim()) ? line.trim() : null));
}

/** Chunks strings so each request stays well under the URL limit. */
function chunk(texts, budget = 1200) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const text of texts) {
    if (current.length > 0 && (size + text.length > budget || current.length >= 40)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function withPool(items, worker, concurrency) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await worker(item);
      } catch (error) {
        console.error(`  ! ${error?.message ?? error}`);
      }
    }
  });
  await Promise.all(runners);
}

/* -------------------------------------------------------------- per locale */

function existingPack(code) {
  const file = join(PACK_DIR, `${code}.json`);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

async function translateLocale(code) {
  const pack = FORCE ? {} : existingPack(code);
  const core = { ...(shortPacks.get(code) ?? {}), ...(corePacks.get(code) ?? {}) };
  const pending = referenceKeys.filter((key) => {
    if (pack[key]) return false;
    if (core[key]) {
      pack[key] = resolveText(core[key], core, en);
      return false;
    }
    return true;
  });
  const todo = LIMIT ? pending.slice(0, LIMIT) : pending;
  console.log(`${code}: ${todo.length} metin çevrilecek (mevcut ${Object.keys(pack).length})`);

  const byLang = { en: [], tr: [] };
  for (const key of todo) {
    const source = sourceOf.get(key);
    if (!source || !needsTranslation(source.text)) {
      pack[key] = resolveText(en[key] ?? tr[key] ?? "", en, tr);
      continue;
    }
    byLang[source.lang].push(key);
  }

  for (const lang of ["en", "tr"]) {
    const keys = byLang[lang];
    if (!keys.length) continue;
    const jobs = chunk(keys.map((key) => sourceOf.get(key).text)).map((texts) => {
      const set = new Set(texts);
      return keys.filter((key) => set.has(sourceOf.get(key).text)).slice(0, texts.length);
    });
    let done = 0;
    await withPool(
      jobs,
      async (jobKeys) => {
        const texts = jobKeys.map((key) => sourceOf.get(key).text);
        let results = await translateBatch(texts, lang, code);
        // Mixed success: retry the failures one by one.
        for (let index = 0; index < texts.length; index += 1) {
          if (results[index] === null) {
            try {
              const single = (await request(texts[index], lang, code)).trim();
              results[index] = keepPlaceholders(texts[index], single) ? single : texts[index];
            } catch {
              results[index] = texts[index];
            }
          }
          pack[jobKeys[index]] = results[index];
        }
        done += jobKeys.length;
        if (done % 200 < jobKeys.length) console.log(`  ${code}: ${done}/${keys.length}`);
      },
      CONCURRENCY,
    );
  }

  // Deterministic key order keeps the diff readable across reruns.
  const ordered = {};
  for (const key of referenceKeys) {
    if (pack[key]) ordered[key] = pack[key];
  }
  mkdirSync(PACK_DIR, { recursive: true });
  writeFileSync(join(PACK_DIR, `${code}.json`), JSON.stringify(ordered, null, 2) + "\n");
  console.log(`${code}: ${Object.keys(ordered).length}/${referenceKeys.length} anahtar yazıldı`);
  return code;
}

/* -------------------------------------------------------------------- main */

const requested = args.locales && args.locales !== "all" ? args.locales.split(",").map((c) => c.trim()) : locales;
const targets = locales.filter((code) => requested.includes(code));
console.log(
  `Çeviri: ${targets.length} dil · referans ${referenceKeys.length} anahtar · eşzamanlılık ${CONCURRENCY}` +
    (LIMIT ? ` · limit ${LIMIT}/dil` : ""),
);

/** In CI the job is long: commit every finished locale so a timeout keeps progress. */
function commitProgress(code) {
  if (!process.env.GITHUB_ACTIONS) return;
  try {
    execSync("node scripts/i18n-pack-index.mjs", { stdio: "inherit" });
    execSync("git add src/lib/i18n/packs", { stdio: "inherit" });
    execSync(`git -c user.name="i18n-bot" -c user.email="i18n@users.noreply.github.com" commit -m "i18n: ${code} paketi (otomatik)" --no-verify`, {
      stdio: "inherit",
    });
    execSync("git pull --rebase --autostash", { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
  } catch (error) {
    console.error(`  ! commit (${code}): ${String(error?.message ?? error).split("\n")[0]}`);
  }
}

const started = Date.now();
const failed = [];
await withPool(
  targets,
  async (code) => {
    try {
      await translateLocale(code);
      commitProgress(code);
    } catch (error) {
      failed.push(code);
      console.error(`${code}: BAŞARISIZ — ${error?.message ?? error}`);
    }
  },
  Math.max(1, Math.min(4, Number(args.locales_parallel ?? 4))),
);

const packs = readdirSync(PACK_DIR).filter((file) => file.endsWith(".json"));
const total = packs.reduce((sum, file) => {
  try {
    return sum + Object.keys(JSON.parse(readFileSync(join(PACK_DIR, file), "utf8"))).length;
  } catch {
    return sum;
  }
}, 0);
console.log(
  `Bitti: ${packs.length} paket · ${total} çeviri · ${Math.round((Date.now() - started) / 1000)} sn` +
    (failed.length ? ` · başarısız: ${failed.join(",")}` : ""),
);
if (failed.length) process.exitCode = 1;
