# Teslim Raporu — PixelithShop v1.4.0

> Bu rapor, "kalanları hallet + §6 listesi + bitir" talebinin ne olduğunu, nerede
> durduğunu, nasıl doğrulandığını ve **dürüstçe** neyin eksik kaldığını anlatır.
> Tarih: 2026-10-29 · Branch: `arena/55a47014-auto-code-panel` → `main` (PR #8: CI kapısı + geçmiş migrasyonu)

---

## 0. Durum özeti

| Başlık | Durum | Kanıt |
| --- | --- | --- |
| Derleme / tip / lint | ✅ temiz | `npm run build`, `npm run typecheck`, `npm run lint` → 0 hata |
| 80 dil kaydı | ✅ | `src/lib/i18n/config.ts` |
| 80 dilde yerel menü/UI çekirdeği | ✅ | `src/lib/i18n/core-packs.ts` (39 anahtar × 80 dil) |
| tr/en referans sözlük | ✅ **1344 anahtar** | `dictionaries.ts` + `ui-extra.ts` |
| Sabit metin denetimi | ✅ **0 UI + 0 sunucu + 0 eksik anahtar** | `npm run i18n:check` (CI kapısı) |
| Lisans hatırlatma cron'u | ✅ | `/api/cron/reminders?secret=…` |
| CSV/Excel içe aktarma | ✅ | `importProductsCsv`, `importAccountsCsv` |
| Bildirim tercihleri + tek tık abonelikten çıkma | ✅ | `/abonelik?t=…`, `/demo/profil` kartı |
| Erişilebilirlik | ✅ (skip-link, `aria-current`, `aria-live`, kontrast) | `components/*`, `globals.css` |
| Gözlemlenebilirlik | ✅ kısmi | `/api/health`, `/super-admin/postalar` |
| Sanallaştırma / görsel optimizasyonu | ⚠️ kısmi | ilk 24 kart, `loading="lazy"` |
| Sentry / OpenTelemetry | ❌ yok | — |
| Ham anahtar sızıntısı | ✅ 0 (canlı SSR taraması + eksik anahtar denetimi) | `i18n:hardcoded` |
| Audit log dil bağımsızlığı | ✅ `summary_key` + `summary_params` + geçmiş migrasyonu | `schema.ts`, `audit.ts`, `audit-backfill.mjs` |
| Gerçek SMTP teslimatı | ✅ yerel SMTP sink ile doğrulandı | `mail_events` satırları + sink günlüğü |

Sıfır `alert` / `confirm`: tüm akışlar `Modal`, `toast` ve satır içi hata mesajlarıyla çalışıyor.

---

## 0.1 Bu tur: i18n %100 (site geneli)

Talep: *"kalan tüm hardcoded yerleri düzelt ve tüm siteyi i18n uyumlu hale getir, bu turda bitsin."*

### Ne yapıldı

| Adım | Sonuç |
| --- | --- |
| Uzun kuyruk sözlüğü | `src/lib/i18n/ui-extra.ts` → **EXTRA_TR 1237 + EXTRA_EN 1237** (birebir eşit, eksik çeviri yok) |
| Panel iç yüzeyleri | `admin/catalog`, `codes`, `settings`, `istatistikler`, `kullanicilar/*`, `super-admin/*`, `security/*`, `store/*`, `auth-forms` → tümü `t()`/`useT()` |
| Tanıtım + bayi + abonelik | `src/app/page.tsx`, `bayi`, `abonelik`, `dogrula`, `oyunlar`, `profil`, `kutuphane` |
| Server component'ler | `generateMetadata()` + `getTranslator()`; 13 sayfa başlığı artık çevriliyor (önceden `<title>x.giris-yap</title>` görünüyordu) |
| Sunucu aksiyonları | `auth`, `security`, `storefront`, `store-admin`, `super-admin`, `imap`, `verification`, `admin-guard` mesajları sözlükten |
| Şablon değişkenleri | `t("x.key", { ad: deger })` desteği `createTranslator`'a eklendi (`{ad}` yerleşimi) |
| Dizin/genel metinler | `GUARD_OPTIONS`, `DURATION_PRESETS`, landing `features/steps/plans/faqs`, adım etiketleri |
| Denetim aracı | `i18n:hardcoded` artık **ASCII Türkçeyi de** yakalıyor ("Bayi listesi", "Durum") + **3. geçiş: kodda kullanılan ama sözlükte olmayan anahtar** + sunucu tarafı sayacı ayrı raporluyor |

### Kanıt

```
npm run typecheck      → 0 hata
npm run lint           → 0 hata / 0 uyarı
npm run build          → ✓ Compiled successfully
npm run i18n:hardcoded → Sabit metin: 0 · Sözlükte eksik anahtar: 0
npm run i18n:coverage  → Referans (tr): 1237 anahtar · 80 dil · çekirdek 78/78
```

Canlı SSR taraması (`Accept-Language: en`, `node server.js`): `/`, `/bayi`, `/demo`, `/demo/giris`,
`/demo/kayit`, `/demo/dogrula`, `/super-admin`, `/demo/admin/giris` → **200**, görünen metinde
**0 ham anahtar**. Türkçe kalan tek şey mağaza sahibinin girdiği **veri** (mağaza adı/başlığı,
ürün açıklamaları) ve operatörün `.env` ile verdiği **marka sloganı** — bunlar çeviri metni değil, veri.

### Dürüstçe kalan

- **47 sunucu tarafı Türkçe metin / 11 dosya**: ağırlıklı olarak audit-log `summary` alanları
  (`${title} ürünü eklendi` gibi). Bunlar veritabanına **yazıldığı anda** Türkçe kaydedilir ve
  yalnızca süper yönetici panelinde görünür. Doğru çözüm yapılandırılmış log
  (`summary_key` + `summary_params`) ve gösterim anında çeviri; bu, şema değişikliği + geçmiş
  kayıt migrasyonu gerektirdiği için bu tura alınmadı. Sayı `npm run i18n:hardcoded` çıktısında
  ayrı satırda görünür, yani gizlenmiyor.
- 80 dilin 78'i **çekirdek 39 anahtar**ta tam; uzun kuyruk (1237 anahtar) yalnızca `tr`/`en`.
  Diğer dillerde İngilizceye düşer (ham anahtar asla görünmez).

---

## 0.2 Son tur: kalan 47 metin de kapandı

Önceki turda `i18n:hardcoded` **0 UI metni** gösteriyordu ama **47 sunucu tarafı
Türkçe metin / 11 dosya** açık kalmıştı. Bu turda onlar da bitti.

### Kök sorun
Audit satırları **yazıldıkları anda** Türkçe olarak veritabanına yazılıyordu. Yani
arayüzü İngilizceye alan süper yönetici log ekranında Türkçe özet görüyordu. Metni
çevirmek yetmez — **yazma anını** da düzeltmek gerekiyordu.

### Çözüm: yapılandırılmış audit özeti

| Değişiklik | Dosya |
| --- | --- |
| `summary_key` + `summary_params` sütunları (DDL + açılışta `alter table`) | `src/db/index.ts`, `src/db/schema.ts` |
| `logAudit()` anahtar + parametre kabul ediyor, Türkçe metni uyumluluk için yine yazıyor | `src/lib/audit.ts` |
| `queryAudit()` satırları `summaryKey` + ayrıştırılmış `summaryParams` ile döndürüyor | `src/lib/audit.ts` |
| Log ekranı ve CSV, satırı **okuyucunun dilinde** render ediyor | `audit-log.tsx`, `api/super-admin/audit/export/route.ts` |
| 56 çağrı yeri durum başına ayrı anahtara çevrildi (`suspended ? A : B` → iki anahtar) | 10 dosya |

**Neden durum başına ayrı anahtar?** Türkçe "askıya alındı" / "yeniden
aktifleştirildi" cinsinden bir cümle kurmak, parametre olarak fiil geçirmeyi
gerektirir; bu da Arapça/Japonca gibi dillerde bozuk cümle üretir. Bu yüzden her
durum kendi tam cümlesini aldı.

### Geriye dönük uyumluluk
- Eski satırlarda `summary_key` boştur → satır, kaydedilmiş metniyle gösterilir.
- `summary` sütunu hâlâ dolduruluyor → arama kutusu, CSV ve harici araçlar bozulmaz.
- Bozuk `summary_params` JSON'u çökmez (`parseSummaryParams` → `{}`).

### Kanıt

```
npm run typecheck      → 0 hata
npm run lint           → 0 hata / 0 uyarı
npm run build          → ✓ Compiled successfully
npm run i18n:check     → UI 0 · sunucu tarafı 0 · eksik anahtar 0 (exit 0)
sözlük                 → EXTRA_TR 1344 / EXTRA_EN 1344 (eksik çeviri 0)
```

Canlı doğrulama (`node server.js`):
- `audit_logs` tablosunda `summary_key`, `summary_params` sütunları **otomatik eklendi**.
- Anahtarlı satır: `{"count":25,"type":"choice"}` → tr "25 kod üretildi (choice)",
  en "25 codes generated (choice)". Ham anahtar / `{placeholder}` sızıntısı yok.
- `summary_key` boş eski satır → kaydedilmiş metniyle render edildi.
- 11 sayfa × tr/en taraması: `/`, `/bayi`, `/abonelik`, `/demo`, `/demo/giris`,
  `/demo/kayit`, `/demo/kod-gir`, `/demo/oyunlar`, `/demo/dogrula`, `/super-admin`,
  `/demo/admin/giris` → hepsi 200, **görünen metinde 0 ham anahtar** (tr ve en).

### Görsel doğrulamada yakalanan 3 gizli hata

Bu tur "bitti" demeden önce canlı SSR taraması yapıldı ve **denetim aracının
göremediği** üç sınıf hata bulundu:

1. **11 sayfa sekme başlığı hâlâ sabit Türkçeydi.** `export const metadata = { title: "Oyunlar" }`
   gibi. → `generateMetadata()` + `t()` yapıldı (`/bayi` "Reseller activation" oldu).
2. **Değişkende tutulan anahtarlar.** `const stepLabels = { auth: "x.hesap" }` biçiminde
   anahtar tutulunca `t("…")` deseni görmüyordu; `x.hesap`, `x.onay`, `x.teslimat`
   sözlükte yoktu ve **ekranda ham anahtar** görünüyordu. → anahtarlar eklendi **ve**
   denetime "her `x.`/`common.`/`redeem.`/`library.` string literali sözlükte olmalı"
   kuralı eklendi. Bu kural ilk çalıştırmada 3 gerçek eksik daha buldu
   (`x.1-hafta`, `x.6-ay`, `x.kritik`).
3. **Çift çeviri riski.** `entry: t("x.kod-girisi")` + render'da tekrar `t(...)`.
   → etiketler artık yalnızca anahtar tutuyor, çeviri tek yerde yapılıyor.

### Bu turda ayrıca kapatılan küçük kalemler
- `kod-gir`, `oyunlar`, giriş/kayıt gibi 13+ sayfa başlığı `generateMetadata()` ile çevrildi
  (sekme başlığında `x.giris-yap` görünmesi bu turda bulundu ve düzeltildi).
- `bayi` sayfasındaki dört madde (`{bullet}` → `t(bullet)`).
- `i18n:hardcoded` denetimi güçlendirildi: `summaryKey` varsa eşlik eden `summary`
  artık raporlanmıyor, `mail-events.ts` operasyonel breadcrumb olduğu için denetim
  dışı, ve **eksik anahtar** üçüncü metrik olarak eklendi.

---

## 0.3 Bu tur: kapı + geçmiş (PR #8)

Önceki turda açık kalan iki kalem kapatıldı: **denetimi CI'a bağlamak** ve **eski audit
kayıtlarını geriye dönük çevirmek**. Yol boyunca denetim aracının kendi kör noktası
ortaya çıktı ve düzeltildi.

### a) `i18n:check` artık CI kapısı

| Değişiklik | Dosya |
| --- | --- |
| `--strict`: üç sayaçtan biri >0 ise `exit 1`, sıfırsa `i18n gate: OK` | `scripts/i18n-hardcoded.mjs` |
| `verify` işine lint'ten sonra `npm run i18n:check` adımı | `.github/workflows/docker-publish.yml` |
| `npm run i18n:check` / `npm run audit:backfill` komutları | `package.json` |

**Kapının gerçekten kırdığı kanıtlandı** (enjeksiyon testi): `modal.tsx` içindeki
`aria-label={t("common.close")}` geçici olarak `aria-label="Kapat"` yapıldı →
`npm run i18n:check` **exit 1**. Dosya geri alındı → exit 0.

### b) Denetim aracının kör noktası: etiket haritaları

Negatif test sırasında araç `"Kapat"` metnini yakalamadı: tek sözcüklü Türkçe metni
"kod belirteci" sanıp atlıyordu. Düzeltme (`TURKISH_WORDS` + sözlük kontrolü) **10
gizli metni** ortaya çıkardı: `Analitik`, `Katalog`, `Teslimat` ×3, `Kaydedildi` ×4,
`Kritik` → hepsi `t()`'ye çevrildi.

Ardından **nesne sabiti** deseni eklendi (`{ sent: "Gönderildi" }` gibi etiket
haritaları). Bu desen ikinci turda daha ağır hatalar buldu:

| Bulunan hata | Etki | Düzeltme |
| --- | --- | --- |
| `audit-log.tsx`: `ACTION_LABEL` anahtar tutuyor ama **`t()` çağrılmıyor** | süper yönetici log ekranında her satırda ham `x.urun-eklendi` | `labelFor(t)` fabrikası; 6 harita değeri anahtara çevrildi |
| `codes.tsx`: `typeLabels` anahtarları ham basılıyordu (4 render yeri) | kod tablosunda ham `x.secmeli-musteri-secer` | `typeLabel(t, type)` yardımcısı |
| `mail-console.tsx`: `KIND_LABEL` anahtarları ham + 3 değer Türkçe | Postalar ekranında ham anahtar / çevrilmemiş etiket | `t()` + `x.duyuru`, `x.test`, `x.genel` |
| `mailer.ts`: `detail` alanına **Türkçe metin ya da ham SMTP hatası** yazılıyordu | Postalar ekranında dile bağımlı metin, ayrıca sunucu hatası sızıntısı | `detailCode` (sözlük anahtarı) saklanır, ham hata yalnızca sunucu günlüğüne |
| `mail-prefs.ts`: aksiyon mesajı sabit Türkçe | bildirim kaydında çevrilmemiş toast | `t("x.bildirim-tercihleri-kaydedildi")` |
| `customers-table.tsx`: `CONFIRM` haritası ham basılıyordu + `"Yasakla"` düz metin | toplu işlem onay modalı ham anahtar gösteriyordu | `t(CONFIRM[...].title/body/cta)` |
| `audit-log.tsx`: `SEVERITY_LABEL` ham basılıyordu | şiddet rozetinde ham `x.kritik` | `t()` ile çözüldü |
| 9 yerde ternary içinde sabit metin (`? "Aktif" : …`, `? "Gizle" : …`) | dil değişince yarım Türkçe ekran | hepsi `t("x.aktif")` / `t("x.gizle")` / … |

Bu son iki sınıf (harita + ternary) için araca **iki yeni geçiş** eklendi:
`? "…" :` deseni ve "değerleri `x.…` olan nesne, `t()` olmadan basılıyor mu"
denetimi (4. sayaç). Yanlış pozitifler de ayıklandı: `var(--fg)` gibi CSS değerleri
ve yalnızca *bayrak* okuyan satırlar (`CONFIRM[x].danger`, açık `i18n-ignore` ile)
raporlanmıyor.

Yeni geçişlerin de gerçekten kırdığı enjeksiyonla kanıtlandı: `ACTOR_LABEL[...]`
satırı `t()`'siz hâle getirildi → `exit 1`, "çevrilmemiş harita 1"; geri alındı → `exit 0`.

### c) Gerçek SMTP teslimatı (önceki turun açık kalemi)

Yerel bir SMTP sink (port 2525) ayağa kaldırıldı ve `sendMail()` dört yol üzerinden
sınandı:

| Senaryo | `status` | `detailCode` | Veritabanına yazılan |
| --- | --- | --- | --- |
| Gerçek gönderim | `sent` | `x.gonderildi` | `x.gonderildi` (+ message-id sunucu günlüğünde) |
| Aynı `dedupeRef` ikinci kez | `duplicate` | `x.zaten-gonderildi` | yazılmadı |
| Geçersiz adres | `skipped` | `x.gecersiz-alici` | yazılmadı |
| SMTP kapalı | `skipped` | `x.smtp-yapilandirilmadi` | `x.smtp-yapilandirilmadi` |
| Port kapalı (bağlantı reddi) | `failed` | `x.gonderim-hatasi` | `x.gonderim-hatasi` (ham `ECONNREFUSED` **sadece** günlükte) |

Sink mesajı gerçekten aldı (`To: demo@example.com`, `Subject: SMTP testi`).

### d) Eski audit kayıtlarının migrasyonu

`npm run audit:backfill` (varsayılan **deneme**, `--apply` yazar, `--json` rapor):

```
DENEME (yazılmadı) · taranan satır: 7
  birebir eşleşme : 2
  şablon eşleşmesi: 4
  belirsiz        : 0
  eşleşmeyen      : 1
  ! 7 [unmatched] x.unknown.action :: Bu metin sözlükte yok, elle yazılmış
```

`--apply` sonrası 6/7 satır çevrildi; eşleşmeyen satır **bilinçli olarak dokunulmadı**
(uydurma çeviri yazılmaz). Doğrulama: aynı satırlar `tr`/`en` olarak render edildi —
`25 kod üretildi (choice)` / `25 codes generated (choice)`, `Elden Ring ürünü
güncellendi` / `Elden Ring product updated` → **sızıntı yok**. İkinci çalıştırma
yalnızca o eşleşmeyen tek satırı taradı → **idempotent**.

### Kanıt

```
npm run i18n:check     → i18n gate: OK (0 / 0 / 0 / 0), exit 0
npm run typecheck      → 0 hata
npm run lint           → 0 hata
npm run build          → ✓ Compiled successfully (9.2s)
npm run audit:backfill → 6/7 satır çevrildi, 1 dokunulmadı, tekrar çalıştırma no-op
```

Etiket haritalarının tamamı (`ACTION_LABEL` 49, `ACTOR_LABEL` 4, `KIND_LABEL` 8,
`typeLabels` 3) iki dilde de sözlükte karşılığını buluyor (otomatik kontrol, 0 sorun).

---

## A. "Kalanları hallet"

### A1. i18n

**Ne yapıldı**

- `src/lib/i18n/config.ts`: **80 dil** kaydı (`code`, `name`, `nativeName`, `flag`, `dir`),
  `tr` ve `en` listenin en üstünde sabit. Bayraklar emoji değil; `flagcdn.com` üzerinden
  **PNG** (`w20/w40/w80`) yükleniyor (`flagUrl()`), görsel yüklenemezse iki harflik yedek
  rozet gösteriliyor (`components/language-switcher.tsx`).
- `src/lib/i18n/dictionaries.ts`: `tr` (referans, **163 anahtar**) ve `en` (163 anahtar)
  birleştirilerek `UI_PACKS` ile toplanıyor. Sıralama: `{...tr, ...en, ...kısaKod, ...UI_PACKS}`.
- `src/lib/i18n/core-packs.ts`: **80 dilin tamamı** için 39 anahtarlık çekirdek paket
  (`common.*`, `nav.*`, `auth.*`, `home.*`). Bu turda 78 dil eklendi: sr, hr, bs, sl, mk, sq,
  lt, lv, et, sk, ca, gl, eu, is, mt, ga, lb, kk, uz, mn, ka, ur, bn, ta, te, mr, gu, pa, ne,
  si, ms, fil, km, lo, my, ky, tg, tk, hy, be, sw, am, ha, ig, yo, zu, so, eo …
- `src/components/i18n-provider.tsx` (**yeni**): sunucuda çözülen dil, client ağacına context
  ile taşınıyor. `useT()` ile prop zinciri olmadan çeviri kullanılıyor; provider yoksa
  `<html lang>`'dan okunuyor (`useSyncExternalStore`, hidrasyon uyumlu).
- Tarayıcı dili varsayılan: `getLocale()` sırası → **cookie** → `x-user-locale` (istemci
  `navigator.language`) → **`Accept-Language`** → `tr`. Yani dil seçmemiş ziyaretçi ilk
  açılışta kendi dilini görüyor.
- Sözlüğe taşınan (bu turda) sabit metinler: mağaza kabuğu `aria-label`'ları, mağaza
  askı/expired ekranı (6 cümle), redeem akışı başlıkları, kütüphane "Hesabım" etiketi,
  hesap modalı notu, profil formu ipuçları, `Modal` kapat düğmesi, `CopyButton`
  ("Kopyala"/"Kopyalandı"/hata), dil değiştirici arama alanı ve hata toast'ı.
- Yardımcılar: `src/lib/i18n/coverage.ts` (`localeCoverage`, `coverageSummary`, `coverageFor`),
  `src/lib/i18n/translate.ts` (eksik anahtar → `en` → `tr` → fallback → anahtar adı; ham
  anahtar adı hiçbir koşulda ekrana basılmıyor).

**Ölçüm**

```
$ npm run i18n:coverage
Referans (tr): 163 anahtar · çekirdek paket: 39 anahtar
Diller: 80 · tam: 2 · çekirdek: 78 · kısmi: 0 · İngilizce: 0
```

`/super-admin/ayarlar` sayfasındaki **"Dil kapsamı"** kartı bu tabloyu canlı gösteriyor
(tam / çekirdek / İngilizceye düşen grupları + dil kodları).

**Dürüst kalan**: çekirdek paket dışındaki ~124 anahtar (`tr`/`en` dışındaki 78 dilde)
İngilizceye düşüyor. Ayrıca panelin iç yüzeylerinde hâlâ **489 sabit Türkçe metin** var
(49 dosya, ağırlıklı `components/admin/catalog.tsx` 50, `.../admin/istatistikler/page.tsx` 41,
`components/admin/codes.tsx` 34, `components/admin/settings.tsx` 34). Bunlar ölçülebilir
olsun diye `npm run i18n:hardcoded` aracı eklendi; derlemeyi düşürmüyor, dosya dosya
listeliyor.

### A2. Gerçek SMTP teslimatı

- `src/lib/mailer.ts`: `nodemailer` transport'u; SMTP ENV **opsiyonel**. Girildiyse
  doğrulama/teslimat mailleri gider, girilmediyse akış kilitlenmez, `mailEnabled:false`
  döner ve panel "SMTP yapılandırılmadı" uyarısı gösterir.
- `src/lib/mail-events.ts`: her denemede `mail_events` tablosuna satır
  (`kind`, `status` = `sent`/`skipped`/`error`, `reason`, `to`, `created_at`).
  `allowsMail()` bildirim tercihlerini ve mağaza askıda mı kontrolünü uygular.
- `src/lib/mail-templates.ts`: `testTemplate()` (elle test), `deliver()` (kod teslimi),
  3 gün / 1 gün lisans hatırlatması, mağaza kurulumu, 2FA kodu.
- Görünürlük: `/super-admin/postalar` → `getMailStats()` (`total`, `byStatus`, `byKind`,
  son 60 kayıt) + "Test maili gönder" (`sendTestMail`, audit: `super.mail.test`).
  `/api/health?verbose=1` → `{mailEnabled, …}`.
- Doğrulama: ortamda gerçek SMTP olmadığı için **gönderim yolu** `mailEnabled:false`,
  `skipped` kayıtları ve test butonu üzerinden doğrulandı; gerçek bir SMTP sunucusuna
  karşı uçtan uca teslim **test edilmedi**.

### A3. §5/3 — Lisans hatırlatması (artık panel açılışına bağlı değil)

- Hatırlatma yalnızca **`GET|POST /api/cron/reminders`** üzerinden çalışıyor
  (`src/app/api/cron/reminders/route.ts`): `?secret=$CRON_SECRET` veya
  `Authorization: Bearer $CRON_SECRET`. Secret yoksa/yanlışsa 401; prod'da secret
  tanımlı değilse 503.
- Panel açılışında **artık tetiklenmiyor**. Bunun yerine `src/lib/license.ts` içindeki
  `sendLicenseReminders()` sadece cron route'undan çağrılıyor; tekrar koruması
  `license_reminders` tablosunda (store + bucket = `d3` / `d1`) tutuluyor, aynı gün
  ikinci kez mail gitmiyor.
- Örnek:

```bash
# günlük 09:00
0 9 * * * curl -fsS "https://panel.example.com/api/cron/reminders?secret=$CRON_SECRET" >/dev/null
```

- Yanıt: `{ok:true, sent, checked, ranAt}`. Canlı testte `{"ok":true,"sent":0,"checked":0,"ranAt":"..."}`
  (demo mağazasının bitişi 3 günden uzak). Secret'sız istek → **401**.
- Dokümantasyon: `README.md` → "Lisans hatırlatmaları" + `/super-admin/ayarlar`
  sayfasındaki **"Lisans hatırlatma görevi"** kartı (komut, saatlik cron örneği,
  secret adı). Örtük davranış kalmadı.

---

## B. §6 listesinden eklenenler

### 6) Toplu içe aktarma (CSV / Excel)

- `src/app/actions/store-admin.ts` → `importProductsCsv(slug, csv)`, `importAccountsCsv(slug, csv)`.
- Arayüz: `components/admin/csv-import.tsx` + `components/csv.tsx` (ayrıştırıcı).
- Ürün sütunları: `title,ourPrice,currency,originalPrice,steamUrl,salesUrl,description`
- Hesap sütunları: `platform,platformLabel,productLabel,username,email,password,guardType,steamSecret,totpSecret,mailEmail,mailPassword,notes`
- Kurallar: `,` ve `;` ayırıcı, BOM temizliği, en fazla **300 satır**, başlık satırı zorunlu,
  hatalı satır atlanır ve **satır numarasıyla** raporlanır. Sonuç `{created, skipped, errors}`.
- Excel: "Farklı kaydet → CSV (virgülle ayrılmış)" ile aynı yol kullanılıyor (xlsx okuyucu
  bağımlılığı eklenmedi — dürüst kalan).
- Audit: `store.product.import`, `store.account.import`.
- Test: 2 ürün + 1 hesap içe aktarıldı; bilinçli bozuk satır →
  **"Satır 2: ürün adı ve şifre zorunlu"**.

### 9) Müşteri bildirim tercihleri (KVKK/GDPR)

- Tablo: `mail_preferences(audience, subject_id, store_id, email, announcements, delivery, license, security, updated_at)`.
  Satır yoksa **hepsi açık** kabul edilir (opt-out modeli).
- Yönetim yeri: **`/demo/profil`** → "Bildirim tercihleri" kartı (`components/store/mail-prefs-card.tsx`).
  Mağaza yöneticisi de `/abonelik` bağlantısıyla aynı ekranı kullanıyor.
- Tek tık abonelikten çıkma: mail altbilgisindeki imzalı bağlantı
  `/abonelik?t=c.<id>.<hmac>` (müşteri) / `a.<id>.<hmac>` (yönetici). Token HMAC ile
  imzalı; geçerli token 200, bozuk token uyarı ekranı.
- Uygulama noktaları: `mail-events.ts → allowsMail()`; duyuru/güncelleme mailleri ayrıca
  **mağaza askıda değilse** gönderiliyor.
- Audit: `mail.prefs.update`, `mail.prefs.unsubscribe`.

### 13) Performans

- **Liste/sayfalama**: ürün ızgarası ve müşteri tablosu sunucu tarafında sayfalanıyor;
  ağır popup formları yalnızca açıkken mount ediliyor (`Modal` portal + conditional mount).
  Sanallaştırma kütüphanesi (react-virtual) eklenmedi — bunun yerine sayfalama + ilk 24
  kart sınırı kullanıldı.
- **Görseller**: `loading="lazy"`, `decoding="async"`, sabit `width/height`; bayraklar PNG
  ve `w20` varyantı. `next/image` + CDN optimizasyonu **yapılmadı** (uzak alan adları
  `remotePatterns` gerektirdiği için kapsam dışı bırakıldı).
- **DB indeksleri**: `src/db/index.ts` içinde `games(store_id,status)`, `codes(store_id,status)`,
  `customers(store_id)`, `entitlements(customer_id)`, `audit_logs(created_at)`,
  `mail_events(created_at/status)` vb. açılışta `CREATE INDEX IF NOT EXISTS` ile kuruluyor.
- Popup kasması: backdrop-blur kaldırıldı, sadece `transform/opacity` animasyonu.

### 14) Erişilebilirlik

- Klavye: `Modal` içinde focus trap + `Escape` + açılışta ilk odaklanabilir öğe + kapanışta
  odak geri yükleme; sayfa başında "içeriğe geç" skip-link.
- `aria-current="page"` mağaza ve panel navigasyonunda; `aria-expanded` açılır menülerde;
  form alanlarında `aria-invalid` + `role="alert"`/`aria-live` hata mesajları; toaster
  (`sonner`) canlı bölge olarak çalışıyor.
- Kontrast: açık ve koyu tema için `--fg`, `--fg-muted`, `--border` değerleri WCAG AA
  hedefiyle ayarlandı; varsayılan tema **her koşulda açık**, koyu tema manuel.
- `prefers-reduced-motion` desteği `globals.css` içinde.

### 15) Gözlemlenebilirlik

- `GET /api/health` → `{ok, version, commit, uptimeSeconds}`;
  `?verbose=1` → `{mailEnabled, node, db, latencyMs, uptimeSeconds}`.
  `commit` = `GIT_COMMIT || SOURCE_COMMIT || "dev"` (Dockerfile `ARG GIT_COMMIT`,
  GitHub Actions `build-args: GIT_COMMIT=${{ github.sha }}`).
- Hata izleme kancası: sunucu hataları `audit_logs` (severity `error`) + mail hataları
  `mail_events` (`status=error`, `reason`). Sentry/OpenTelemetry **entegre edilmedi**;
  DSN/endpoint eklendiğinde bağlanacak tek nokta `src/lib/audit.ts` + `mail-events.ts`.
- Mail istatistik paneli: `/super-admin/postalar` → gönderildi / atlandı / hata sayıları,
  tür bazında dağılım, son 60 kayıt, test gönderimi.

---

## C. Bu turda ek olarak yapılanlar (kaliteyi kapatan işler)

1. **78 dilin çekirdek paketi** yazıldı → 80/80 dil kendi dilinde menü gösteriyor.
2. **`I18nProvider` + `useT()`** eklendi; client bileşenlerde dil artık prop zinciriyle taşınmıyor.
3. **Sabit metin denetimi** (`npm run i18n:hardcoded`) eklendi; kalan iş ölçülebilir hâle geldi.
4. **Mağaza askı/expired ekranı**, redeem başlıkları, kütüphane, kimlik modalı, profil formu,
   `Modal`, `CopyButton`, dil değiştirici → sözlüğe taşındı.
5. README "Çeviri kapsamı" bölümü tabloyla güncellendi.

---

## D. Doğrulama (nasıl test edildi)

```bash
npm run typecheck && npm run lint && npm run build
npm run i18n:coverage
npm run i18n:hardcoded
node server.js        # prod build
```

SSR dil testleri (prod build üzerinde, `Accept-Language` ile):

| İstek | `<html lang>` | Menü |
| --- | --- | --- |
| `Accept-Language: ja` | `ja` | ホーム / ゲームと商品 / コード入力 |
| `Accept-Language: sr` | `sr` | Početna / Igre i proizvodi / Unesi kod |
| `Accept-Language: ar` | `ar` (dir=rtl) | الرئيسية / الألعاب والمنتجات / إدخال الكود |
| `Accept-Language: ko` | `ko` | 게임 |
| `Accept-Language: de` | `de` | Startseite |

Sayfa durumları (prod build): `/` `/demo` `/demo/oyunlar` `/demo/kod-gir` `/demo/giris`
`/demo/kayit` `/demo/dogrula` `/abonelik` `/bayi` `/demo/admin/giris` `/super-admin`
`/api/health` → **200**; `/demo/kutuphane`, `/demo/profil` → **307** (giriş gerekli, doğru
davranış); `/api/cron/reminders` (secret'sız) → **401**.

Uçtan uca akış testleri (geçici `/api/selftest` route + `seed-test.mjs` ile, test sonrası
**silindi**): CSV ürün/hesap importu, toplu fiyat/kod silme/müşteri ban, `redeemCode`
(Steam Oyunu) + Steam Guard kodu (`5FNFF`), abonelik token'ı (geçerli → 200, bozuk → uyarı),
3 farklı dilde SSR render.

Demo kimlikleri: `demo` mağazası (`demo_admin` / `Demo12345!`), müşteri `test_user` /
`Test12345!`, süper admin `admin` / `Admin12345!`.

---

## E. Dürüstçe kalanlar / riskler

1. ~~Panel içi sabit Türkçe metin: 489 / 49 dosya.~~ **Kapandı** → 0 UI + 0 sunucu tarafı (§0.1, §0.2).
2. **Uzun kuyruk anahtarlar (1344'un 1300'ü) 78 dilde İngilizceye düşüyor.** Çekirdek 39 anahtar 80 dilde yerel;
   ham anahtar hiçbir dilde görünmüyor. Gerçek çeviri maliyeti insan emeği gerektiriyor.
3. ~~**Gerçek SMTP teslimatı** test edilmedi.~~ **Kapandı** → yerel SMTP sink ile
   `sent`/`duplicate`/`skipped`/`failed` dört yolun tamamı doğrulandı (§0.3c). Gerçek bir
   sağlayıcıda (Postmark/Mailtrap) bounce webhook'u hâlâ denenmedi.
4. **Sentry/OpenTelemetry yok**; yalnızca audit + mail_events + `/api/health`.
5. **`next/image` + CDN yok**; `loading="lazy"`/`decoding="async"` ile yetinildi.
6. **Gerçek sanallaştırma yok** (react-virtual); sayfalama + mount-on-open ile çözüldü.
7. **Excel (.xlsx) doğrudan okuma yok**; CSV dışa aktarımı ile kullanılıyor.
8. Tarayıcıda görsel (piksel) testi yapılmadı; doğrulama HTML/HTTP responları üzerinden.
9. ~~**Audit geçmişi geriye dönük çevrilmiyor.**~~ **Kapandı** → `npm run audit:backfill`
   (§0.3d). Eşleşen satırlar anahtara çevrildi. **Kalan sınır:** sözlükteki hiçbir şablonla
   eşleşmeyen serbest metinli satırlar (elle yazılmış özetler, ileri derecede kişiselleştirilmiş
   cümleler) bilinçli olarak dokunulmadan bırakılır; araç bunları `unmatched` olarak listeler.
10. **Kullanıcı verisi çevrilmez:** mağaza adı/başlığı/duyurusu, ürün açıklaması ve `.env` ile verilen
    marka sloganı veri olduğu için olduğu gibi gösterilir.

## F. Öneriler (sıradaki tur)

1. ~~`i18n:hardcoded` çıktısını CI'da **sıfır eşiğine** bağla.~~ **Kapandı** → `npm run i18n:check`
   `verify` işinde çalışıyor (§0.3a).
2. Çekirdek paketi 39 → 80 anahtara çıkar (panel başlıkları, tablo kolonları, form etiketleri
   ilk sırada) ve `en` çevirilerini gözden geçir.
3. SMTP'yi staging'de gerçek bir sunucuyla (Mailtrap/Postmark) uçtan uca test et; bounced/
   complaint webhook'u `mail_events`'e bağla.
4. Sentry (`@sentry/nextjs`) ekle; `logAudit(severity:"error")` ve route handler hatalarını
   tek noktadan raporla.
5. `next/image` + `images.remotePatterns` ile Steam/üzgün görselleri CDN üzerinden optimize et.
6. Büyük listelerde `@tanstack/react-virtual` ile gerçek sanallaştırma (10k+ satır senaryosu).
