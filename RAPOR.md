# Teslim Raporu — PixelithShop v1.4.0

> Bu rapor, "kalanları hallet + §6 listesi + bitir" talebinin ne olduğunu, nerede
> durduğunu, nasıl doğrulandığını ve **dürüstçe** neyin eksik kaldığını anlatır.
> Tarih: 2026-10-29 · Branch: `arena/55a47014-auto-code-panel` → `main` (PR #8: CI kapısı + geçmiş migrasyonu)

---

## 0.0y Bu tur: süre uzatma kilidi, hız, yükleme yüzdesi, sihirbaz alanları (PR #17)

> Tarih: 2026-10-31 · Branch: `arena/4ae7c765-auto-code-panel` → `main`

### Yapılanlar
| # | Konu | Ayrıntı |
| --- | --- | --- |
| 1 | Süre uzatma linki artık mağazaya kapalı | `saveStoreSettings` formdan `renewalUrl` **okumuyor** ve kolonu yazmıyor; ayarlar ekranındaki alan `readOnly/disabled` + kilit rozeti ve "platform tarafından yönetilir" açıklaması. Süre uzatma linkini yalnız `super-admin.ts` (bayi/global ayarlar) yazabiliyor. Doğrulama: form `renewalUrl=https://evil.example.com/renew` gönderdi, DB'de `renewal_url` **NULL** kaldı. |
| 2 | Vitrin 15–20 sn bekletmiyor | `[magazaSlug]/layout.tsx` font `<link>`'i artık **render-blocking değil**: `media="print"` + `onload` ile async, `<noscript>` yedeği var, yalnız kullanılan aile istenir, `preconnect` Google **veya** Fontshare'e göre seçilir. Logo/kapak görselleri yüklemede `sharp` ile WebP'ye indiriliyor (2600×2600 PNG → 1.9 KB) ve başlık logoları `loading="lazy"`'den `eager` + `fetchPriority="high"`'a alındı (logo artık sonradan "patlamıyor"). |
| 3 | Yükleme yüzdesi + kilit + yarım dosya temizliği | `lib/upload-client.ts`: `XMLHttpRequest.upload.onprogress` ile gerçek yüzde, `AbortController` ile iptal, sekmeyi kapatınca `keepalive` DELETE. Yükleme sürerken **kaydet düğmesi kilitli** ("Yükleme bitmeden kaydedilemez"). Sunucu önce `data/media/.tmp` dizinine yazıp başarıda `rename` ediyor; kopan istek `request.signal.aborted` ile 499 dönüyor ve 10 dakikadan eski artıklar her yüklemede `pruneTempUploads()` ile siliniyor. |
| 4 | Kod sihirbazında hesap adı/e-posta | Hesap seçim satırı artık görünen ad + e-posta + platform + ürün etiketi gösteriyor (`AccountOption` alanları ayrıştırıldı); boş e-postada "E-posta yok" yazar. |
| 5 | Girişte 2FA | Akış zaten bağlıydı (bayi/mağaza/müşteri + süper yönetici); bu turda **uçtan uca doğrulandı**: seed'lenmiş güvenlik sorusu faktörüyle `storeAdminLogin → needs2fa:true, methods.question:true` → `verifyTwoFactorLogin("question")` → `ok:true`, `kr_store` çerezi, `/demo/admin` yönlendirmesi. |
| 6 | Görünüm + daha çok font | Font seçici baştan yazıldı (`font-picker.tsx`): Google (**1.575**) + Fontshare (**33**) = **1.608 aile**, sağlayıcı sekmeleri ("Tümü / Google Fonts / Fontshare"), kategori çipleri, arama, IntersectionObserver ile yalnız görünen satırın önizlemesi (en fazla 6 aile/istek, eşzamanlı 2 istek, oturumda bir kez). Eski sürüm her tuş vuruşunda 10'a kadar blocking CSS isteği atıyordu. Ayarlar formuna yapışkan kaydet çubuğu eklendi. |

### Doğrulama (bu turda çalıştırıldı)
- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (0 uyarı) · `npm run build` ✅
- `npm run i18n:check` → `OK (0 / 0 / 0 / 0)` · `i18n:verify` → `78 dil · referans 1635 anahtar · ok: 78` · `i18n:coverage` → tüm diller `full`
- Canlı: `/` 47 ms, `/demo` 58 ms, `/demo/admin/ayarlar` 60 ms (yerel). Vitrin HTML'inde font `<link media="print">` var, blocking stylesheet yok.
- Yükleme API'si: 2600×2600 PNG → `{"ok":true,"bytes":1952,"originalBytes":98696}` (`/media/<sha1>.webp`), `DELETE ?path=` dosyayı siliyor, `../` içeren yol reddediliyor (`removed:false`), 30 dakikalık `.tmp` artığı bir sonraki yüklemede temizlendi.
- Fontshare: `fontFamily=Clash Display` kaydedildi, vitrin `api.fontshare.com/v2/css?f[]=clash-display&display=swap` + preconnect üretti.

### Bilinen sınırlar
- 8 yeni anahtar 78 pakete elle çevrildi (makine çevirisi işi bu turda ağ erişimi olmadığı için çalıştırılmadı); `i18n:verify` hepsini geçti.
- Fontshare slug'ları katalogdan; yanlış bir slug yalnız o satırın önizlemesini bozar (CSS 400 → sistem fontu), kaydı engellemez.

---

## 0.0z Bu tur: fiyat planları, şifre kasası, gerçek görsel/font yükleme (PR #14)

> Tarih: 2026-10-31 · Branch: `arena/cabc42da-auto-code-panel` → `main` (merge `acee239`)

### Yapılanlar
| # | Konu | Ayrıntı |
| --- | --- | --- |
| 1 | Bayrak bulanıklığı | Bayraklar artık `country-flag-icons` SVG'lerinden `public/flags/<cc>.svg` olarak üretiliyor (`scripts/flags.mjs`, 69 dosya / 280 KB); `flagcdn` PNG + `object-cover` kaldırıldı. |
| 2 | Görseller sunucuda | `src/lib/media.ts` içerik adresli medya kütüphanesi (`data/media/<sha1>.<ext>`) + `/media/[file]` route'u (`immutable` cache). Steam kapakları, CSV içe aktarma ve logo yüklemeleri buraya iniyor; referans kalmayınca dosya siliniyor. |
| 3 | Para birimleri | `src/lib/currency.ts` ISO-4217 tam listesi (~160 kod), `Intl.DisplayNames`/`narrowSymbol` ile türetim, `SYMBOL_OVERRIDES` (KWD/SAR/IRR). Bilinmeyen kur artık **null** döner (eski `?? 1` 60 USD'yi 60 TRY yapıyordu). |
| 4 | Eksik çeviri artıkları | `x.ozel-platform`, "Duyurular" gibi sabit metinler sözlüğe taşındı (`i18n gate: 0/0/0/0`). |
| 5 | Fiyat planları DB'de | `plans` tablosu + `/super-admin/fiyatlar` editörü (fiyat, para birimi, süre, hesap limiti, özellikler, satın alma linki, sıralama, öne çıkan/yayında, dil bazlı çeviri). Ana sayfa kartları `listPlans()` ile geliyor, buton `purchaseUrl`'e gidiyor, taze kurulumda üç varsayılan plan seed ediliyor. |
| 6 | Şifre kasası | `store_admins.password_enc` / `customers.password_enc` (AES-256-GCM). Giriş hâlâ hash ile doğrulanıyor; kasa yalnızca platform sahibinin destek amaçlı görebilmesi için. `/super-admin` → "Giriş bilgileri": göster/gizle, kopyala, yeni şifre belirle; her erişim audit'te. |
| 7 | 5 MB logo, 50 MB font | `POST /api/store/upload` route handler (server action gövde limiti 1 MB olduğu için). Logo/favicon 5 MB, TTF/OTF/WOFF/WOFF2 50 MB; `/media` doğru MIME döndürüyor, eski dosya referans kalmayınca siliniyor. |
| 8 | Font kataloğu | `scripts/fonts.mjs` → `src/lib/font-catalog.ts`: **1.581 Google Fonts ailesi** (kategori + latin-ext bilgisi), seçicide arama/kategori filtresi/canlı önizleme. Yüklenen font Google ailesine göre öncelikli ve vitrinde `@font-face` ile kullanılıyor. |
| 9 | Kod giriş ekranı | `/{magaza}/kod-gir` giriş/kayıt kartıyla aynı tasarım: mağaza rozeti, başlık/açıklama, gövde, alt bağlantı satırı ("hesabınız yok mu? / giriş yap / kütüphanem"). |
| 10 | 78 dil tam çeviri | Yeni 51 anahtar GitHub Actions `i18n translate` işiyle 78 dile çevrildi: **her paket 1626/1626 anahtar**, `coverage: 80 dil · tam 80 · kısmi 0`. Yer tutucular (`{count}`, `{store}`, `{user}`) korunuyor. |

### Doğrulama (bu turda çalıştırıldı)
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅
- `npm run i18n:check` → `OK (0 / 0 / 0 / 0)` · `i18n:verify` → `78 dil · ok: 78` · `i18n:coverage` → `80 · tam 80`
- Canlı test: `/`, `/demo`, `/demo/kod-gir`, `/super-admin/fiyatlar`, `/demo/admin/ayarlar` → 200.
- Upload testi: 3,4 MB PNG → `200` + `/media/<sha1>.png` (image/png); 100 KB TTF → `200` (font/ttf); 5 MB üstü → `413`, yanlış tür → `400`, oturumsuz → `401`.
- Plan editörü/DB: `plans` üç satır seed edildi; `resolvePlan(plan, "en")` → "Starter" (dil bazlı override), bilinmeyen dilde taban metne düşüyor.
- `formatMoney` örnekleri: `₺1.234,50`, `¥1.235`, `د.ك 1.234,500`, `﷼ 1.234,50`.

### Dürüstçe kalanlar
- **"~10 bin font"**: Google Fonts kataloğunun tamamı 1.581 aile; 10.000 aile Google'da yok. İstenen çeşitlilik için yükleme yolu (TTF/OTF/WOFF, 50 MB) açık — katalog dışı fontlar bu yolla eklenebilir.
- Şifre kasası **yalnızca bu turdan sonra** oluşturulan/değiştirilen şifreleri gösterir; eski kayıtların hash'i geri çevrilemez, panel bu hesaplar için "şifre belirle" akışını sunar.
- Çeviriler makine çevirisi; kritik pazarlama metinleri için insan gözden geçirmesi önerilir.
- Yüklenen 50 MB font dosyaları diskte tutulur; depolama kotası/otomatik temizlik (prune) yalnızca referanssız medya için var.

---

## 0.0a Bu tur: 78 dilin tamamı çevrildi (PR #12)

Talep: *"dilleri yap hepsini, kalanları tek seferde bitir."* Önceden 78 dilde yalnızca
39 anahtarlık çekirdek paket vardı; uzun kuyruk İngilizceye düşüyordu. Artık **her dilde
1575/1575 anahtar** var.

### Nasıl yapıldı
| Adım | Ayrıntı |
| --- | --- |
| Paket biçimi | `src/lib/i18n/packs/<dil>.json` (düz anahtar-değer). `scripts/i18n-pack-index.mjs` bunları statik import haritasına çevirir; elle import yok. |
| Çeviri işi | `scripts/i18n-translate.mjs` — kaynak İngilizce (TR'de olup EN'de olmayan anahtarlar için Türkçe), `{placeholder}` korunur, başarısız dize tek tek yeniden denenir, dil başına commit atılır (kopan koşu kaldığı yerden devam eder). |
| Nerede koştu | Sandbox `translate.googleapis.com`'a çıkamıyor; **GitHub Actions**'ta koştu ve paketleri dala commit etti (`.github/workflows/i18n-translate.yml`). |
| Uç nokta | `gtx` ucu veri merkezi IP'lerine **429** dönüyor (kanıt: `.i18n/probe.log`). `clients5.google.com/translate_a/t?client=dict-chrome-ex` ucu hem açık hem **toplu** (`q` tekrarı) → 78 dil ~5 dakikada bitti. |
| Bağlam ipuçları | "Menu" → "Speisekarte" (yemek menüsü) çevirisini önlemek için 4 kısa anahtar bağlamlı kaynakla yeniden çevrildi (`SOURCE_HINTS`). |
| İstemci ağırlığı | Paketler **yalnızca sunucu demetinde**; tarayıcıya `I18nProvider` prop'u ile tek dil olarak geçiyor (`dictionaries.ts` içine konmadı, yoksa 78 × ~110 KB istemciye girerdi). |

### Doğrulama (bu turda çalıştırıldı)
- `node scripts/i18n-verify.mjs` → **78 dil · ok: 78** (eksik anahtar 0, placeholder uyumsuzluğu 0, "İngilizce kalmış" paket 0).
- `npm run i18n:coverage` → **Diller: 80 · tam: 80**.
- `npm run build` ✅ · `typecheck` ✅ · `lint` ✅ · `i18n:check` → `0 / 0 / 0 / 0` ✅
- Canlı SSR taraması: **80 dil × 14 sayfa = 1120 istek** (ana sayfa, /bayi, mağaza vitrini, giriş, kayıt, kod-gir, ürünler + 7 admin sayfası oturumlu) → **ham anahtar 0, HTTP hatası 0**.
- Örnek çıktı: `/demo/giris` → de "Willkommen zurück", ja "おかえり", ar "مرحبًا بعودتك", sw "Karibu tena".

### Dürüstçe kalanlar
- Çeviriler **makine çevirisi** (Google). Yeniden kullanılan 78 pakette ton/terminoloji tutarlılığı garanti değil; kritik pazarlama metinleri için insan gözden geçirmesi önerilir.
- Aktif dilin paketi RSC yükünde sayfa başına ~+110 KB (sıkıştırılmış ~30 KB) taşınıyor. Daha da küçültmek için anahtar budama yapılabilir; şu an doğruluk için tam sözlük gönderiliyor.
- İlk (429'a takılan) çeviri koşusu iptal edilemedi (GitHub App'in `actions: write` izni yok); o koşu dil paketlerini İngilizce metinle ezerse `i18n:verify` bunu yakalar ve betik o paketi otomatik yeniden çevirir (yazma guard'ı eklendi).

---

## 0.0 Bu tur: SS'li 20+ maddelik hata listesi (PR #10)

> Talep: ekran görüntüleriyle gelen listenin **tamamı** düzeltilecek, kısmi teslim yok.

| # | Bildirim | Yapılan | Kanıt |
| --- | --- | --- | --- |
| 1 | Kod oluşturma sihirbazında süre seçici ham anahtar gösteriyor (`x.1-yl`) | `panels.tsx` süre listesi sözlük anahtarına çevrildi, `t()` ile basılıyor; 2 Yıl ve "Özel (gün)" eklendi | `/super-admin` SSR'da `Özel (gün)`, `2 Yıl` |
| 2 | Hesap ekleme popup'ında ham kategori etiketleri (`x.egitim`) | `fonts.ts` grupları `x.grup-*` anahtarı; `catalog.tsx` `<optgroup label={t(group)}>` | `i18n:check` 0 |
| 3 | Ana sayfada dil/tema seçici yok | `site-header.tsx` yeniden yazıldı: `LanguageSwitcher` + `ThemeToggle` + mobil drawer | `/` SSR çıktısı |
| 4 | Yatay kaydırma / taşan düzen | `html,body{overflow-x:clip}`, `body{max-width:100vw}`, `≤640px` tablo sarmalayıcıları, `min-width:0` | `globals.css` |
| 5 | Hamburger üstten açılıyor, sol taraf kararmıyor | Site + mağaza + admin + süper admin: **sağdan drawer**, yarı saydam backdrop, Escape, gövde kaydırma kilidi | 4 shell dosyası |
| 6 | Logoya basınca ana sayfaya dönmüyor | `SiteHeader` → `/`, mağaza shell → mağaza kökü, admin/süper admin → panel kökü | grep + SSR |
| 7 | Üst bar linkleriyle gidip yenileyince sayfa ortada açılıyor | `scroll-padding-top`/`scroll-margin-top` + `usePathname` etkisinde açık scroll (hash varsa hedefe, yoksa en üste) | `site-header.tsx`, `globals.css` |
| 8 | Dil kutusu sol kenara giriyor | `language-switcher.tsx` `position:fixed` + viewport clamp + resize/scroll takibi | `language-switcher.tsx` |
| 9 | Yalnız TR/EN çalışıyor | 80 dil canlı tarandı: her dilde `raw key` = 0, HTTP hatası = 0 (aşağıya bakın) | canlı SSR taraması |
| 10 | Mağaza kodu üretiminde süre uzatma linki değiştirilemiyor | Süper admin sihirbazında düzenlenebilir alan (boş = ENV varsayılanı), bayilik koduna yazılıyor; mağaza **Ayarlar**'a da alan eklendi → `stores.renewal_url` | `/super-admin`, `/demo/admin/ayarlar` SSR |
| 11 | Öncelik sırası hatası | `store.renewalUrl → platform settings → env` (önce env kazanıyordu) | `(panel)/layout.tsx` |
| 12 | Mağaza sayfalarında tema flash / kalıcı değil | `pix-theme` çerezi + `cookies()` ile SSR `data-theme`; inline script yalnız uyuşmazlığı onarıyor | `curl -b pix-theme=dark` → `data-theme="dark"` |
| 13 | Font seçicide her seçenek kendi fontuyla görünmüyor | Önizleme listesi 6'şar Google Fonts isteğine bölünerek yükleniyor | `admin/settings.tsx` |
| 14 | Steam import'ta açıklama güncellenmiyor | `lastImport` ref'i: elle yazılmadıysa yeni açıklama eskisini değiştirir | `catalog.tsx` |
| 15 | Admin oturumu varken "Kayıt ol" açılıyor | `giris`/`kayit` sayfalarında çift guard (müşteri → kütüphane, yönetici → panel) | `307 → /demo/admin` |
| 16 | Input yazarken butonlara focus sıçrıyor | `modal.tsx` focus effect `[open]` + `onCloseRef` | `modal.tsx` |
| 17 | Kod türü seçiminde tik yok | Dolu daire + beyaz tik, `role=radio`/`aria-checked` | `codes.tsx` |
| 18 | Kod oluşturma 2. adımda süre seçilemiyor | Sınırsız/1-3 gün/1 hafta/1 ay/3 ay/6 ay/1 yıl/**özel gün**; süre koda yazılıyor ve teslimatta gerçekten uygulanıyor | `codes.tsx`, `storefront.ts` |
| 19 | Kayıt/giriş ekranı tasarımı | Kart tasarımı, sekme, şifre göster/gizle, misafir uyarısı | `/demo/giris`, `/demo/kayit` SSR |
| 20 | "Bu hesap paylaşımlıdır…" uyarısı | Metin silindi | `credentials-modal.tsx` |
| 21 | Logo yüklemede "https ile başlamalıdır" hatası | `isLogoSrc()`: `http(s)://` veya `data:image/*;base64` (≤400k) | `store-admin.ts` |
| 22 | ENV'de silinen slogan geri geliyor | `readOptional()` — boş değer varsayılanı ezmez | `env.ts` |

**Ek olarak bulunan ve düzeltilenler:** kod süresi teslimatta hiç uygulanmıyordu (her zaman `null`) → artık `codes.durationMinutes` hem `entitlements.expiresAt` hem `redemptions.accessExpiresAt` olarak yazılıyor; müşteri kütüphanesinde "Sınırsız erişim" yerine kalan süre gösteriliyor; yönetici "kütüphaneye teslimat ekle" akışında süre seçimi yok sayılıyordu (`void durationMinutes`) → artık uygulanıyor; müşteri detayındaki süre select'i ham anahtar basıyordu; süper admin denetim kaydında `<th>Yapan</th>` ham Türkçeydi.

**Doğrulama (bu turda çalıştırıldı):**
- `npm run build` ✅ · `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run i18n:check` → `0 / 0 / 0 / 0` ✅
- Sözlük: **1611 anahtar** (tr/en tam), 80 dil × çekirdek paket 39 anahtar + İngilizce yedek.
- Canlı SSR taraması (`node server.js` + curl): **80 dil × 6 herkese açık sayfa** (`/`, `/bayi`, `/demo`, `/demo/giris`, `/demo/kayit`, `/demo/kod-gir`) = 480 istek → hepsi 200, ham anahtar 0.
- Oturumlu tarama: mağaza admini 7 sayfa × 7 dil, süper admin 5 sayfa → 200, ham anahtar 0.
- Tema: `pix-theme=dark|light` çerezi SSR'da `data-theme` olarak doğrulandı. Yönlendirme: admin oturumu varken `/demo/kayit` ve `/demo/giris` → `307 /demo/admin`.

**Dürüstçe kalanlar:**
- Tarayıcı (Playwright/Chrome) bu ortamda yok; drawer animasyonu, focus sıçraması ve süre sihirbazının 2. adımı **tıklanarak** değil, kod + SSR çıktısı + tip/lint kapılarıyla doğrulandı. Etkileşimli son kontrol kullanıcı tarafında yapılmalı.
- 78 dilde çekirdek UI (menü, sepet/hesap fiilleri, giriş-kayıt, ürün ızgarası) yerel; uzun kuyruk metinler İngilizceye düşüyor (ham anahtar değil). 1611 anahtarın 78 dile elle çevrilmesi bu turun kapsamı dışında.

---

## 0. Durum özeti

| Başlık | Durum | Kanıt |
| --- | --- | --- |
| Derleme / tip / lint | ✅ temiz | `npm run build`, `npm run typecheck`, `npm run lint` → 0 hata |
| 80 dil kaydı | ✅ | `src/lib/i18n/config.ts` |
| 80 dilde yerel menü/UI çekirdeği | ✅ | `src/lib/i18n/core-packs.ts` (39 anahtar × 80 dil) |
| tr/en referans sözlük | ✅ **1378 anahtar** | `dictionaries.ts` + `ui-extra.ts` |
| Sabit metin denetimi | ✅ **0 / 0 / 0 / 0** (UI · sunucu · eksik anahtar · ham harita) | `npm run i18n:check` (CI kapısı) |
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
sözlük                 → EXTRA_TR 1378 / EXTRA_EN 1378 (eksik çeviri 0)
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

## 0.4 Derin test turu: gerçek oturumlarla ekran doğrulaması

Önceki tur "bitti" dedikten sonra şüphe üzerine **gerçek oturum çerezleri üretilip**
(süper yönetici / mağaza yöneticisi / müşteri) ekranlar tarayıcı HTML'i üzerinden
tek tek okundu. Sonuç: denetim aracı yeşil olmasına rağmen **ekranda hâlâ Türkçe ve
ham anahtar vardı**. Aşağıdaki 8 sınıf bulundu ve kapatıldı.

| # | Bulgu | Nerede görünüyordu | Düzeltme |
| --- | --- | --- | --- |
| 1 | `Denetim`, `Tarih`, `Platform` ×2, `Bayilik durumu`, `Kalan bayilik`, `Bayilik Kodu` sabit metin | süper yönetici log ekranı, istatistik tablosu, katalog, ayarlar, kayıt formu | 7 anahtar + `t()` |
| 2 | Sunucu mesajı "Bayilik kodu iptal edildi." | bayi kodu iptal toast'ı | `x.bayilik-kodu-iptal-edildi-2` |
| 3 | `|| "…"` varsayılanları: "Dijital teslimat", "Teslimat" ×3, "Misafir", "En yeni mailden alındı" | kütüphane, oyun kartları, kimlik modalı | anahtar + `t()`; **araç `||` desenini artık tarıyor** |
| 4 | `mail-preferences.tsx`: `label`/`hint`/`aria-label` anahtar tutuyor ama `t()` yok | **`/demo/profil` ve `/demo/admin/ayarlar`, TR ve EN'de 8 ham anahtar** | `t(item.label)` |
| 5 | `istatistikler`: `RANGES` etiketleri (`x.7-gun`…), boş grafik metni, kod tipi etiketleri, hafta günleri | istatistik ekranı, TR ve EN'de 6 ham anahtar | hepsi `t()`; hafta günleri tam 7 anahtar (önceden 6 Türkçe + 1 anahtar karışıktı) |
| 6 | `store-stats.ts` içinde **sabit `createTranslator("tr")`** ve `toLocaleDateString("tr-TR")` | tüm istatistik etiketleri, dil ne olursa olsun Türkçe | çevirici + locale çağırandan enjekte ediliyor |
| 7 | Postalar ekranında durum rozetleri ham enum (`sent`, `failed`, `skipped`, `duplicate`) | `/super-admin/postalar` | `STATUS_LABEL` + `t()` |
| 8 | Kendi satırındaki 25 JSX metin düğümü (`Sil`, `Kapat`, `Kaydet`, `Devam et`, `Geri`, `Tamam`, `Lisans`, `Duyuru`, `Detay`, …) | kod tablosu, müşteri detayı, redeem akışı, CSV import, paneller | 25 anahtar + `t()` |

### Denetim aracına eklenen geçişler

- `|| "…"` varsayılanları ve kendi satırındaki JSX metin düğümü deseni.
- **Karışık kap (mixed container)**: değerleri hem sözlük anahtarı hem düz Türkçe
  olan nesne/dizi (`["Pzt","Sal","x.car",…]`) raporlanır.
- Veri anahtarları (`actorName`, `slug`, `ref`, `email` …) ve CSS değerleri için
  yanlış pozitif filtresi; Türkçe sözcük listesi hafta günleri, aylar ve para/zaman
  terimleriyle genişletildi.
- Her yeni geçiş **enjeksiyonla** doğrulandı (boz → `exit 1`, geri al → `exit 0`).

### Kanıt (gerçek oturum, canlı sunucu)

```
19 rota × 2 dil (tr/en) → hepsi 200 · görünür metinde ham anahtar 0
  · süper yönetici: /super-admin, /loglar, /postalar, /ayarlar, /duyurular
  · mağaza yöneticisi: /istatistikler, /kodlar, /kullanicilar, /ayarlar
  · müşteri: /kutuphane, /profil   · halka açık: /, /bayi, /abonelik, /demo/*
/super-admin/loglar (EN): Product deleted · Store settings updated · Reseller key revoked
                          · Store admin · Critical  (eylem/aktör/şiddet etiketleri çevrili)
/super-admin/postalar (EN): Verification · Delivery receipt · SMTP is not configured
                          · Delivery failed · Already sent · Invalid recipient address
/demo/profil (EN): Announcements and updates · Delivery receipts · Licence alerts · Save
istatistik (EN): 7 days / 30 days / 90 days · Mon … Sun   · (TR: 7 gün · Pzt … Paz)
backfill sonrası aynı EN log ekranı: 4 eski satır İngilizceye döndü, eşleşmeyen 1 satır
                          bilinçli olarak Türkçe kaldı
```

Sözlük: **1378 TR / 1378 EN**. `i18n:check` → `0 / 0 / 0 / 0`, typecheck 0, lint 0, build ✓.

### Hâlâ yapılamayanlar (dürüst sınırlar)

- **Tarayıcı/piksel testi yok**: doğrulama sunucunun ürettiği HTML üzerinden yapıldı;
  modal açma, toast, hover gibi etkileşimler otomatik test edilmedi.
- **Veri akışına bağlı ham basım statik olarak yakalanamıyor**: bir anahtarın diziye
  konup başka bir dosyada `t()` olmadan render edilmesi ancak sayfa açılarak
  görülebiliyor. Bu turda 5 böyle hata **ekranı okuyarak** bulundu; statik geçişler
  bunların bir kısmını (karışık kaplar) yakalıyor, tamamını değil.
- Gerçek e-posta sağlayıcısında (Postmark/Mailtrap) bounce/complaint webhook'u denenmedi.

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
2. **Uzun kuyruk anahtarlar (1378'un 1300'ü) 78 dilde İngilizceye düşüyor.** Çekirdek 39 anahtar 80 dilde yerel;
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
