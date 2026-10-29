#!/usr/bin/env node
/**
 * i18n hardcoded-text audit.
 *
 * Finds Turkish text that is still written directly in the source instead of
 * going through the dictionary. Two passes:
 *
 *  1. UI pass — JSX children, attributes, toasts/`setError`, `?? "..."` fallbacks
 *     and JSX template literals.
 *  2. Server pass — action result messages and audit-log summaries.
 *  3. Key-map pass — object literals that hold dictionary keys (`{ sent: "x.…" }`)
 *     must be rendered through `t()`/`pick()`; printing `MAP[id]` shows the key.
 *  4. Missing-key pass — every `x.`/`common.`/`redeem.`/`library.` literal used in
 *     the code must exist in the dictionary.
 *
 * Turkish is detected with diacritics **and** with a stop-word heuristic, so
 * ASCII-only Turkish ("Bayi listesi", "Durum", "Hesap yok") is caught too.
 * Add `i18n-ignore` to a line to opt it out (used for URL fragments).
 *
 * Run with `npm run i18n:hardcoded` (report only) or `npm run i18n:check`
 * (`--strict`: exits 1 when any of the three counters is above zero — this is the
 * gate wired into CI). `-- --json` prints the machine readable report.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SKIP_DIRS = new Set(["node_modules", ".next", "i18n"]);
/**
 * Transactional e-mail templates are sent in the store's language (a business
 * decision), not in the interface locale, so they are excluded from the UI
 * audit on purpose.
 */
const SKIP_FILES = new Set(["src/lib/mailer.ts", "src/lib/mail-templates.ts"]);
/**
 * `mail_events`/`mailer` summaries are operational breadcrumbs without an
 * audience (`announcement → 12`), so they are not part of the readable audit
 * trail and do not need a dictionary key.
 */
const EXT = new Set([".ts", ".tsx"]);

const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/;
const TURKISH_WORDS = new Set(
  `ve ile bir bu da de mi ya ki cok çok tum tüm her sey şey gibi kadar sonra once önce daha az en ama fakat veya
   icin için olarak olan olur yok var hepsi uzerinden üzerinden kayit kayıt hesap kod bayi magaza mağaza musteri
   müşteri urun ürün fiyat sil ekle duzenle düzenle kaydet kapat ac aç goster göster gizle ara sec seç tumu tümü
   liste detay durum aktif pasif yeni eski adet gun gün saat dakika toplam ortalama son ilk adim adım sira sıra
   tikla tıkla yukle yükle indir kopyala yapistir yapıştır eklendi silindi guncellendi güncellendi kullanildi
   kullanıldı secildi seçildi hazir hazır musait müsait tanesi basina başına gore göre hakkinda hakkında bilgi
   notlar zaman sistem ayarlar yonetim yönetimi panel kullanici kullanıcı kayitlar islem işlem turu türü tekil
   coklu çoklu adedi silinemedi kaydedilemedi guncellenemedi okunamadi okunamadı gecersiz geçersiz bulunamadi
   bulunamadı gerekiyor lutfen lütfen adresi adres kaydedildi onay teslimat kritik uyar
   analitik katalog silindi eklendi kaldir kaldır kaydet ekle arama toplam toplamı secim seçim
   hedef hedefi adimlar adımlar sonuc sonuç basarili başarılı hatali hatalı bekliyor bekleniyor
   kullanildi kullanıldı uretildi üretildi gonderildi gönderildi acildi açıldı kapatildi kapatıldı
   guncel güncel surum sürüm yedek geri ileri devam bitir tamam iptal kayitli kayıtlı
   genel duyuru lisans dogrulama doğrulama karslama karşılama guvenlik güvenlik
   teslim gonderim gönderim hata bildirim mesaj konu icerik baslik başlık`
    .split(/\s+/)
    .filter(Boolean),
);
const WORD = /[A-Za-zÇĞİÖŞÜçğıöşü]+/g;

function isTurkish(text) {
  if (!text || !text.trim()) return false;
  if (TURKISH_LETTER.test(text)) return true;
  const tokens = text.toLowerCase().match(WORD) ?? [];
  const score = tokens.filter((token) => TURKISH_WORDS.has(token)).length;
  return score >= 2 || (score === 1 && tokens.length <= 2);
}

const UI_PATTERNS = [
  />\s*([^<>{}]+?)\s*</g,
  /(?:aria-label|placeholder|alt|label|sub|title|description)\s*=\s*"([^"]+)"/g,
  /(?:aria-label|placeholder|alt|label|sub|title|description)\s*=\s*\{\s*`([^`]+)`\s*\}/g,
  /(?:toast\.(?:success|error|info|warning)|setError)\(\s*"([^"]+)"/g,
  /(?:toast\.(?:success|error|info|warning)|setError)\(\s*`([^`]+)`/g,
  /\?\?\s*"([^"]+)"/g,
  /**
   * Inline ternaries in JSX: `{active ? "Aktif" : t("x.pasif")}`. The literal is
   * neither an attribute nor a child text node, so it needs its own pattern.
   */
  /\?\s*"([^"]{2,})"\s*:/g,
  /**
   * Object-literal maps such as `{ announcement: "Duyuru" }`. Without this the
   * label tables (kind/status maps) slipped through: the values are neither JSX
   * children nor attributes, so nothing else matched them.
   */
  /^\s*(?:[A-Za-z_$][\w$]*|"[^"]{1,40}")\s*:\s*"([^"]{2,})",?\s*$/gm,
];
const SERVER_PATTERNS = [/(?:message|error|summary|title|subtitle|description)\s*:\s*[`"']([^`"']+)[`"']/g];
/**
 * A `summaryKey` on the same object literal makes the row localised, so any
 * `summary` next to it is only a compatibility mirror and is not reported.
 */
const SUMMARY_KEY_PATTERN = /summaryKey\s*:/;

/** Keys the code asks for, collected so missing dictionary entries can be reported. */
const KEY_PATTERN = /\bt\(\s*"([^"]+)"/g;
/**
 * Keys held in variables (`const LABELS = { auth: "x.hesap" }`) are not visible
 * to KEY_PATTERN but break the UI just the same, so every `x.`-prefixed string
 * literal is treated as a key that must resolve.
 */
const KEY_LITERAL_PATTERN = /"((?:x|common|redeem|library)\.[a-z0-9.-]+)"/g;

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
const serverFiles = [];
const usedKeys = new Set();
let total = 0;
let serverTotal = 0;
let skipped = 0;

/**
 * Names of object literals whose values are dictionary keys (`{ sent: "x.…" }`).
 * Such a map is *not* copy: printing `MAP[id]` directly shows the key.
 */
function labelMapsIn(source) {
  const names = new Set();
  for (const decl of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\{/g)) {
    // Brace-match from the opening `{` so an inline `= {}` does not swallow the
    // rest of the file (that used to create false positives).
    let depth = 0;
    let end = decl.index + decl[0].length - 1;
    for (let i = end; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = source.slice(decl.index, end);
    const values = [...body.matchAll(/"([^"]{2,})"/g)].map((m) => m[1]);
    const keys = values.filter((value) => /^x\.[a-z0-9.-]+$/.test(value));
    if (keys.length >= 2) names.add(decl[1]);
  }
  return names;
}

const rawMapHits = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.has(rel)) {
    skipped += 1;
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(KEY_PATTERN)) usedKeys.add(match[1]);
  for (const match of source.matchAll(KEY_LITERAL_PATTERN)) usedKeys.add(match[1]);
  const hits = [];
  const serverHits = [];
  const lines = source.split("\n");
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (line.includes("i18n-ignore")) return;
    for (const pattern of UI_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        const text = (match[1] ?? "").trim();
        if (!isTurkish(text)) continue;
        if (text.startsWith("x.") || text.includes("className")) continue;
        // CSS values (`var(--fg)`, `#0f172a`) are code, not copy.
        if (/^(?:var\(--|#[0-9a-f]{3,8}$|-?\d)/i.test(text)) continue;
        // Skip obvious code tokens (class names, paths, colours) but never a
        // Turkish stop-word: "Kapat" used to be filtered out as an identifier.
        if (/^[a-z0-9._/#@%:-]+$/.test(text) && !TURKISH_WORDS.has(text)) continue;
        hits.push(text);
      }
    }
    if (SUMMARY_KEY_PATTERN.test(line)) return;
    for (const pattern of SERVER_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        const text = (match[1] ?? "").trim();
        if (!isTurkish(text)) continue;
        if (text.startsWith("x.") || /^[a-z][a-z0-9.-]*$/.test(text)) continue;
        serverHits.push(text);
      }
    }
  });
  for (const mapName of labelMapsIn(source)) {
    for (const line of lines) {
      if (!line.includes(`${mapName}[`)) continue;
      if (line.includes("i18n-ignore")) continue;
      // A key map is only safe if the value is resolved through `t`/`pick` on
      // the same expression; otherwise the raw `x.…` key reaches the screen.
      if (/\b(?:t|pick|translate)\(/.test(line)) continue;
      // `const key = MAP[id]` is fine when the key is translated a line or two
      // later (`return t(key)`); check a small window instead of one line.
      const at = lines.indexOf(line);
      const window = lines.slice(at, at + 3).join(" ");
      if (/const\s+\w+\s*=\s*\w+\[/.test(line) && /\b(?:t|pick|translate)\(/.test(window)) continue;
      rawMapHits.push({ file: rel, line: line.trim().slice(0, 120) });
    }
  }
  if (hits.length) {
    const unique = [...new Set(hits)];
    total += unique.length;
    files.push({ file: rel, count: unique.length, samples: unique.slice(0, 3) });
  }
  if (serverHits.length) {
    const unique = [...new Set(serverHits)];
    serverTotal += unique.length;
    serverFiles.push({ file: rel, count: unique.length, samples: unique.slice(0, 2) });
  }
}

/* Third pass: keys used in the code but missing from the dictionaries. */
function dictionaryKeys(path) {
  const source = readFileSync(path, "utf8");
  return new Set([...source.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]));
}
const dictionary = new Set([
  ...dictionaryKeys(join(SRC, "lib/i18n/dictionaries.ts")),
  ...dictionaryKeys(join(SRC, "lib/i18n/ui-extra.ts")),
]);
const missingKeys = [...usedKeys].filter((key) => !dictionary.has(key)).sort();

files.sort((a, b) => b.count - a.count);
serverFiles.sort((a, b) => b.count - a.count);
const json = process.argv.includes("--json");
const strict = process.argv.includes("--strict");

if (json) {
  console.log(
    JSON.stringify({ total, files, serverTotal, serverFiles, missingKeys, rawMapHits }, null, 2),
  );
} else if (strict) {
  // Compact output for CI: the detail is only useful when something fails.
  console.log(
    `i18n gate: UI ${total} · sunucu ${serverTotal} · eksik anahtar ${missingKeys.length} · çevrilmemiş harita ${rawMapHits.length}`,
  );
  for (const row of files) console.log(`  UI        ${row.count}  ${row.file}`);
  for (const row of serverFiles) console.log(`  SUNUCU    ${row.count}  ${row.file}`);
  for (const key of missingKeys) console.log(`  EKSİK     ${key}`);
  for (const row of rawMapHits) console.log(`  HARİTA    ${row.file}: ${row.line}`);
} else {
  console.log(`Sabit (çevrilmemiş) Türkçe metin: ${total} · dosya: ${files.length}`);
  if (skipped) console.log(`Atlandı: ${skipped} dosya (işlemsel e-posta şablonları — mağaza dilinde gönderilir)`);
  for (const row of files) {
    console.log(`  ${String(row.count).padStart(3)}  ${row.file}`);
    console.log(`        ör: ${row.samples.join(" · ")}`);
  }
  console.log(
    "\nNot: bu metinler `src/lib/i18n/ui-extra.ts` içine `x.<slug>` anahtarı olarak eklenir.",
  );
  console.log(`Sözlükte eksik anahtar (kodda kullanılıyor): ${missingKeys.length}`);
  for (const key of missingKeys.slice(0, 20)) console.log(`  - ${key}`);
  console.log(
    `\nSunucu tarafı Türkçe metin (audit özeti / aksiyon mesajı): ${serverTotal} · dosya: ${serverFiles.length}`,
  );
  for (const row of serverFiles.slice(0, 15)) {
    console.log(`  ${String(row.count).padStart(3)}  ${row.file}`);
    console.log(`        ör: ${row.samples.join(" · ")}`);
  }
  if (serverFiles.length > 15) {
    console.log(`  ... ${serverFiles.length - 15} dosya daha (--json ile tamamı)`);
  }
  console.log(`\nÇevrilmeden basılan etiket haritası (ham \`x.…\` anahtarı ekrana çıkar): ${rawMapHits.length}`);
  for (const row of rawMapHits.slice(0, 15)) {
    console.log(`  ${row.file}`);
    console.log(`        ${row.line}`);
  }
}

if (strict && (total > 0 || serverTotal > 0 || missingKeys.length > 0 || rawMapHits.length > 0)) {
  console.error(
    "\ni18n gate FAILED. Sıfır olmayan sayaç var: çevrilmemiş metin ya da sözlükte olmayan anahtar kullanıcıya ham metin/anahtar olarak yansır.",
  );
  process.exit(1);
}
if (strict) console.log("i18n gate: OK (0 / 0 / 0 / 0)");
