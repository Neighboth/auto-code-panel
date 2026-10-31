#!/usr/bin/env node
/**
 * Copies the SVG flag of every supported locale into `public/flags`.
 *
 * The language switcher used to load `flagcdn.com` PNGs at 20/40 px. Those are
 * raster images, so on a 2–3× display (and inside the admin sidebar, where the
 * icon is scaled) they looked blurry. A bundled SVG is pixel-perfect at any
 * size, works offline and removes a third-party request from the critical path.
 *
 * Run after changing `src/lib/i18n/config.ts`:  node scripts/flags.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "node_modules", "country-flag-icons", "3x2");
const TARGET = join(ROOT, "public", "flags");

const config = readFileSync(join(ROOT, "src", "lib", "i18n", "config.ts"), "utf8");
const flags = [...new Set([...config.matchAll(/flag:\s*"([a-z]{2})"/g)].map((m) => m[1].toUpperCase()))];

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

const missing = [];
for (const flag of flags) {
  try {
    copyFileSync(join(SOURCE, `${flag}.svg`), join(TARGET, `${flag.toLowerCase()}.svg`));
  } catch {
    missing.push(flag);
  }
}
const copied = readdirSync(TARGET).length;
console.log(`public/flags: ${copied} SVG` + (missing.length ? ` · eksik: ${missing.join(",")}` : ""));
