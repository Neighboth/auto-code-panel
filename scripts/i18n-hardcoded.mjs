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
 *
 * Turkish is detected with diacritics **and** with a stop-word heuristic, so
 * ASCII-only Turkish ("Bayi listesi", "Durum", "Hesap yok") is caught too.
 * Add `i18n-ignore` to a line to opt it out (used for URL fragments).
 *
 * Run with `npm run i18n:hardcoded` (or `-- --json`). The script never fails
 * the build; it only reports, so remaining work stays visible and measurable.
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
const SKIP_FILES = new Set(["src/lib/mailer.ts", "src/lib/mail-templates.ts", "src/lib/mail-events.ts"]);
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
   bulunamadı gerekiyor lutfen lütfen adresi adres kaydedildi onay teslimat kritik uyar`
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
];
const SERVER_PATTERNS = [/(?:message|error|summary|title|subtitle|description)\s*:\s*[`"']([^`"']+)[`"']/g];

/** Keys the code asks for, collected so missing dictionary entries can be reported. */
const KEY_PATTERN = /\bt\(\s*"([^"]+)"/g;

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

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.has(rel)) {
    skipped += 1;
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(KEY_PATTERN)) usedKeys.add(match[1]);
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
        if (/^[a-z0-9./#@:-]+$/i.test(text)) continue;
        hits.push(text);
      }
    }
    for (const pattern of SERVER_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        const text = (match[1] ?? "").trim();
        if (!isTurkish(text)) continue;
        if (text.startsWith("x.") || /^[a-z][a-z0-9.-]*$/.test(text)) continue;
        serverHits.push(text);
      }
    }
  });
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

if (json) {
  console.log(JSON.stringify({ total, files, serverTotal, serverFiles, missingKeys }, null, 2));
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
}
