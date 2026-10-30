#!/usr/bin/env node
/**
 * Regenerates `src/lib/i18n/packs/index.ts` from the JSON packs on disk.
 *
 * Packs ship as plain `.json` (one object per locale) so the translation job can
 * write them without touching TypeScript; this script turns them into a static
 * import map the bundler can follow.
 */
import { readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src", "lib", "i18n", "packs");
const files = readdirSync(dir)
  .filter((file) => file.endsWith(".json") && file !== "coverage.json")
  .sort();

const lines = [
  'import type { Dictionary } from "@/lib/i18n/dictionaries";',
  "",
  "/**",
  " * Complete per-locale packs.",
  " *",
  ' * `scripts/i18n-pack-index.mjs` regenerates this file from the `packs/`',
  " * directory, so adding a language pack never needs a hand-written import.",
  " * Precedence in `dictionaries.ts`: tr/en → full pack → core pack → English.",
  " */",
];

const skipped = [];
const counts = {};
for (const file of files) {
  const code = file.replace(/\.json$/, "");
  const dictionary = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const count = Object.keys(dictionary).length;
  counts[code] = count;
  if (count === 0) {
    skipped.push(code);
    continue;
  }
  // JSON is valid TypeScript, so the pack is imported directly.
  lines.push(`import ${code.replace(/-/g, "_")}Pack from "./${file}";`);
}

lines.push("");
lines.push("export const FULL_PACKS: Record<string, Dictionary> = {");
for (const file of files) {
  const code = file.replace(/\.json$/, "");
  if (skipped.includes(code)) continue;
  lines.push(`  ${JSON.stringify(code)}: ${code.replace(/-/g, "_")}Pack as Dictionary,`);
}
lines.push("};");
lines.push("");

writeFileSync(join(dir, "index.ts"), lines.join("\n"));
// Key counts only: the language switcher shows coverage badges and must not
// import the packs themselves into the browser bundle.
writeFileSync(join(dir, "coverage.json"), JSON.stringify(counts, null, 2) + "\n");
console.log(`packs/index.ts: ${files.length - skipped.length} dil` + (skipped.length ? ` (boş: ${skipped.join(", ")})` : ""));
