#!/usr/bin/env node
/** Connectivity probe for the translation endpoints (runs in GitHub Actions). */
const targets = [
  ["gtx-single", "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t&q=Hello%20world"],
  ["clients5-batch", "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=de&q=Hello%20world&q=Sign%20in"],
  ["translate.google", "https://translate.google.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t&q=Hello%20world"],
];
const lines = [`probe ${new Date().toISOString()}`];
for (const [name, url] of targets) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.text()).replace(/\s+/g, " ").slice(0, 160);
    lines.push(`${name}: HTTP ${response.status} ${Date.now() - started}ms :: ${body}`);
  } catch (error) {
    lines.push(`${name}: FAIL ${Date.now() - started}ms :: ${String(error?.message ?? error)}`);
  }
}
const text = lines.join("\n");
console.log(text);
if (process.env.GITHUB_ACTIONS) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(".i18n/probe.log", text + "\n");
}
