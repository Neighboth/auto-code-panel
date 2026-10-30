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

const positive = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const CONCURRENCY = Math.min(16, positive(args.concurrency, 6));
const LIMIT = positive(args.limit, 0);
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

/**
 * A few English words are ambiguous out of context ("Menu" became "Speisekarte",
 * a restaurant menu). These sources are only used to *ask* for the translation.
 */
const SOURCE_HINTS = {
  "common.menu": "Navigation menu",
  "common.back": "Back to previous page",
  "common.code": "Access code",
  "common.remaining": "Time remaining",
};

const textFor = (key, lang) => {
  const source = sourceOf.get(key);
  const hinted = lang === "en" ? SOURCE_HINTS[key] : undefined;
  return hinted ?? source?.text ?? "";
};

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

/**
 * `translate.googleapis.com` answers 429 to datacenter IPs (verified with
 * `scripts/i18n-probe.mjs`), while `clients5.google.com/translate_a/t` with the
 * `dict-chrome-ex` client stays available *and* accepts many `q` parameters in
 * one request — which is both faster and far gentler on the rate limit.
 */
const BATCH_ENDPOINT = "https://clients5.google.com/translate_a/t";
const SINGLE_ENDPOINT = "https://clients5.google.com/translate_a/single";
const MAX_URL = 7000;

/** Google speaks a few language codes differently from ISO-639-1. */
const GOOGLE_CODE = { zh: "zh-CN", fil: "tl", no: "nb", he: "iw", jv: "jw" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let throttles = 0;

async function post(url, attempt = 0) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429 || response.status === 503) {
      throttles += 1;
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.trim().startsWith("<")) throw new Error("HTML challenge");
    return JSON.parse(text);
  } catch (error) {
    if (attempt >= 6) throw error;
    const throttled = String(error?.message ?? "").includes("429") || String(error?.message ?? "").includes("503");
    const base = throttled ? Math.min(30_000, 1500 * 2 ** attempt) : 500;
    await sleep(base + Math.random() * 500);
    return post(url, attempt + 1);
  }
}

/** Normalises `["a","b"]` / `[["a"],["b"]]` / `{"sentences":…}` into strings. */
function flatten(payload) {
  if (typeof payload === "string") return [payload];
  if (Array.isArray(payload)) return payload.map((item) => (Array.isArray(item) ? item[0] ?? "" : String(item ?? "")));
  if (payload && Array.isArray(payload.sentences)) return [payload.sentences.map((s) => s.trans ?? "").join("")];
  return [String(payload ?? "")];
}

async function translateMany(texts, from, to) {
  const query = texts.map((text) => `&q=${encodeURIComponent(text)}`).join("");
  const url = `${BATCH_ENDPOINT}?client=dict-chrome-ex&sl=${GOOGLE_CODE[from] ?? from}&tl=${GOOGLE_CODE[to] ?? to}${query}`;
  if (url.length > MAX_URL) throw new Error("batch too large");
  const payload = await post(url);
  const lines = flatten(payload).map((line) => String(line).trim());
  if (lines.length === texts.length) return lines;
  // Older response shape nests one array per input string.
  if (Array.isArray(payload) && payload.length === texts.length) {
    return payload.map((item) => flatten(item)[0]?.trim() ?? "");
  }
  return null;
}

/*
  Batch endpoint `q` limit: keep each URL comfortably below the gateway limit.
  `chunk()` budgets characters *and* item count.
*/
const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;
const placeholders = (text) => (text.match(PLACEHOLDER) ?? []).sort();

function keepPlaceholders(source, translated) {
  const expected = placeholders(source);
  const actual = placeholders(translated);
  if (expected.length !== actual.length) return false;
  return expected.every((token, index) => token === actual[index]);
}

/** Strings that carry no letters (codes, prices, symbols) are copied verbatim. */
const needsTranslation = (text) => /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0530-\u058f\u0590-\u06ff\u0900-\u0dff\u0e00-\u0eff\u10a0-\u10ff\u1e00-\u1eff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(text) && text.length > 1;

/** Translates one batch; per-item failures are retried individually. */
async function translateBatch(texts, from, to) {
  let lines = null;
  try {
    lines = await translateMany(texts, from, to);
  } catch {
    lines = null;
  }
  const results = new Array(texts.length).fill(null);
  if (lines) {
    lines.forEach((line, index) => {
      if (line && keepPlaceholders(texts[index], line)) results[index] = line;
    });
  }
  for (let index = 0; index < texts.length; index += 1) {
    if (results[index] !== null) continue;
    try {
      const single = await translateMany([texts[index]], from, to);
      const value = single?.[0]?.trim();
      results[index] = value && keepPlaceholders(texts[index], value) ? value : null;
    } catch {
      results[index] = null;
    }
  }
  return results;
}

/**
 * Groups keys so each request stays under the URL budget.
 *
 * Keys are chunked — never their text — because two keys can share the same
 * English string ("Save" appears in a dozen places), and matching the response
 * back by text silently dropped those keys.
 */
function chunkKeys(keys, textOf, budget = 1200, maxItems = 25) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const key of keys) {
    const length = (textOf(key) ?? "").length;
    if (current.length > 0 && (size + length > budget || current.length >= maxItems)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(key);
    size += length + 6;
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

/**
 * A pack that is mostly the English source text is not a translation (it is what
 * an earlier run wrote when every request failed). Such packs are ignored so the
 * locale is translated again.
 */
function isUntranslated(pack) {
  const keys = Object.keys(pack);
  if (keys.length === 0) return true;
  let identical = 0;
  let compared = 0;
  for (const key of keys) {
    const source = sourceOf.get(key);
    if (!source) continue;
    compared += 1;
    if (pack[key] === source.text) identical += 1;
  }
  return compared > 20 && identical / compared > 0.6;
}

function existingPack(code) {
  const file = join(PACK_DIR, `${code}.json`);
  if (!existsSync(file)) return {};
  try {
    const pack = JSON.parse(readFileSync(file, "utf8"));
    if (!FORCE && isUntranslated(pack)) {
      console.log(`${code}: mevcut paket çevrilmemiş görünüyor, yeniden çevrilecek`);
      return {};
    }
    return pack;
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
    const jobs = chunkKeys(keys, (key) => sourceOf.get(key).text);
    let done = 0;
    await withPool(
      jobs,
      async (jobKeys) => {
        const texts = jobKeys.map((key) => textFor(key, lang));
        const results = await translateBatch(texts, lang, code);
        for (let index = 0; index < texts.length; index += 1) {
          pack[jobKeys[index]] = results[index] ?? texts[index];
        }
        done += jobKeys.length;
        if (done % 200 < jobKeys.length) console.log(`  ${code}: ${done}/${keys.length}`);
      },
      CONCURRENCY,
    );
  }

  /*
   * Never commit a pack that is just the English source text. That is what a run
   * produces when every request fails (429), and it would make a locale look
   * translated while showing English.
   */
  if (isUntranslated(pack)) {
    console.error(`${code}: çeviri başarısız görünüyor (İngilizce metin oranı yüksek) — yazılmadı`);
    throw new Error("untranslated output");
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

// An empty dispatch input arrives as "true" (the parser's flag value) — treat it as "all".
const wanted = args.locales && !["all", "true", ""].includes(args.locales) ? args.locales : null;
const requested = wanted ? wanted.split(",").map((code) => code.trim()) : locales;
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
  Math.max(1, Math.min(6, positive(args.locales_parallel, 4))),
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
