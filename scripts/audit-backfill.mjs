#!/usr/bin/env node
/**
 * Audit-log back-fill: gives old rows a dictionary key.
 *
 * Before v1.4.0 the audit trail stored only Turkish prose in `summary`. Rows
 * written since then also carry `summary_key` + `summary_params`, which is what
 * makes the log readable in any interface language. This script repairs the
 * historical rows that only have prose.
 *
 * How a row is matched
 * --------------------
 * 1. **Exact match** — the stored text equals a dictionary value verbatim
 *    (`"Ürün silindi"` → `x.urun-silindi`). Highest confidence.
 * 2. **Template match** — the stored text fits a dictionary value that contains
 *    `{placeholders}` (`"25 kod üretildi (choice)"` → `x.count-kod-uretildi-type`
 *    with `{count: 25, type: "choice"}`). The match must be **unique**: if two
 *    templates fit the same text the row is reported as ambiguous and left
 *    untouched rather than being guessed.
 *
 * Anything that does not match stays exactly as it is. The super admin log still
 * shows the localised *action* column for those rows, so they remain readable.
 *
 * Usage
 * -----
 *   node scripts/audit-backfill.mjs            # dry run, writes nothing
 *   node scripts/audit-backfill.mjs --apply    # writes the migration
 *   node scripts/audit-backfill.mjs --apply --json
 *
 * Idempotent: only rows with an empty `summary_key` are considered.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const apply = process.argv.includes("--apply");
const json = process.argv.includes("--json");

/**
 * Same shape as the runtime dictionaries: plain object literals of
 * `"key": "text"`. `marker` is the declaration that opens the block, e.g.
 * `const tr: Dictionary = {`.
 */
function dictionary(path, marker) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(marker);
  if (start === -1) return {};
  const end = source.indexOf("\n};", start);
  const body = source.slice(start, end);
  const out = {};
  for (const match of body.matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),\s*$/gm)) {
    out[JSON.parse(match[1])] = JSON.parse(match[2]);
  }
  return out;
}

const root = process.cwd();
const tr = {
  ...dictionary(path.join(root, "src/lib/i18n/dictionaries.ts"), "const tr: Dictionary = {"),
  ...dictionary(path.join(root, "src/lib/i18n/ui-extra.ts"), "export const EXTRA_TR: Record<string, string> = {"),
};
const en = {
  ...dictionary(path.join(root, "src/lib/i18n/dictionaries.ts"), "const en: Dictionary = {"),
  ...dictionary(path.join(root, "src/lib/i18n/ui-extra.ts"), "export const EXTRA_EN: Record<string, string> = {"),
};

if (Object.keys(tr).length === 0) {
  console.error("Sözlük okunamadı — dosya adları değişmiş olabilir.");
  process.exit(1);
}

const EXACT = new Map();
const TEMPLATES = [];

for (const [key, text] of Object.entries(tr)) {
  if (!text || !en[key]) continue; // only keys that exist in both languages
  if (text.includes("{")) {
    const names = [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    if (names.length === 0) continue;
    const pattern = text
      .split(/\{\w+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("(.+?)");
    TEMPLATES.push({ key, names, regex: new RegExp(`^${pattern}$`, "s") });
  } else if (!EXACT.has(text)) {
    EXACT.set(text, key);
  }
}

function match(summary) {
  const text = (summary ?? "").trim();
  if (!text) return { kind: "empty" };
  const exact = EXACT.get(text);
  if (exact) return { kind: "exact", key: exact, params: {} };

  const hits = [];
  for (const template of TEMPLATES) {
    const found = template.regex.exec(text);
    if (!found) continue;
    const params = {};
    template.names.forEach((name, index) => {
      params[name] = found[index + 1];
    });
    hits.push({ key: template.key, params });
    if (hits.length > 1) break;
  }
  if (hits.length === 1) return { kind: "template", ...hits[0] };
  if (hits.length > 1) return { kind: "ambiguous" };
  return { kind: "unmatched" };
}

const sqlitePath = process.env.SQLITE_PATH ?? "./data/app.db";
const absolute = path.isAbsolute(sqlitePath) ? sqlitePath : path.join(root, sqlitePath);
if (!existsSync(absolute)) {
  console.error(
    `Veritabanı bulunamadı: ${absolute}\nSQLITE_PATH ile doğru dosyayı gösterin (uygulamayı bir kez başlatmak dosyayı oluşturur).`,
  );
  process.exit(1);
}
const db = createClient({ url: `file:${absolute}` });

const columns = (await db.execute("pragma table_info(audit_logs)")).rows.map((row) => row.name);
if (!columns.includes("summary_key")) {
  console.error("audit_logs.summary_key sütunu yok — uygulamayı bir kez başlatıp migrasyonun çalışmasını sağlayın.");
  process.exit(1);
}

const rows = (
  await db.execute(
    "select id, action, summary from audit_logs where coalesce(summary_key, '') = '' order by id",
  )
).rows;

const stats = { total: rows.length, exact: 0, template: 0, ambiguous: 0, unmatched: 0, empty: 0 };
const untouched = [];

for (const row of rows) {
  const result = match(row.summary);
  if (result.kind === "empty") {
    stats.empty += 1;
    continue;
  }
  if (result.kind === "ambiguous" || result.kind === "unmatched") {
    stats[result.kind] += 1;
    untouched.push({
      id: row.id,
      action: row.action,
      reason: result.kind,
      summary: String(row.summary ?? "").slice(0, 80),
    });
    continue;
  }
  stats[result.kind] += 1;
  if (apply) {
    await db.execute({
      sql: "update audit_logs set summary_key = ?, summary_params = ? where id = ?",
      args: [result.key, JSON.stringify(result.params), row.id],
    });
  }
}

if (json) {
  console.log(JSON.stringify({ applied: apply, database: absolute, stats, untouched }, null, 2));
} else {
  console.log(`Veritabanı: ${absolute}`);
  console.log(`${apply ? "UYGULANDI" : "DENEME (yazılmadı)"} · taranan satır: ${stats.total}`);
  console.log(`  birebir eşleşme : ${stats.exact}`);
  console.log(`  şablon eşleşmesi: ${stats.template}`);
  console.log(`  belirsiz        : ${stats.ambiguous}`);
  console.log(`  eşleşmeyen      : ${stats.unmatched}`);
  console.log(`  boş özet        : ${stats.empty}`);
  for (const item of untouched.slice(0, 15)) {
    console.log(`  ! ${item.id} [${item.reason}] ${item.action} :: ${item.summary}`);
  }
  if (untouched.length > 15) console.log(`  ... ${untouched.length - 15} satır daha (--json)`);
  if (!apply) console.log("\nYazmak için: node scripts/audit-backfill.mjs --apply");
}

db.close();
