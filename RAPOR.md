# Teslim Raporu — PixelithShop v1.4.0

> Bu rapor, "kalanları hallet + §6 listesi + bitir" talebinin ne olduğunu, nerede
> durduğunu, nasıl doğrulandığını ve **dürüstçe** neyin eksik kaldığını anlatır.
> Tarih: 2026-10-29 · Branch: `arena/90473209-auto-code-panel` → `main` (PR #3, PR #4)

---

## 0. Durum özeti

| Başlık | Durum | Kanıt |
| --- | --- | --- |
| Derleme / tip / lint | ✅ temiz | `npm run build`, `npm run typecheck`, `npm run lint` → 0 hata |
| 80 dil kaydı | ✅ | `src/lib/i18n/config.ts` |
| 80 dilde yerel menü/UI çekirdeği | ✅ | `src/lib/i18n/core-packs.ts` (39 anahtar × 80 dil) |
| tr/en referans sözlük | ✅ 163 anahtar | `src/lib/i18n/dictionaries.ts` |
| Sabit metin denetimi | ⚠️ 489 metin / 49 dosya | `npm run i18n:hardcoded` |
| Lisans hatırlatma cron'u | ✅ | `/api/cron/reminders?secret=…` |
| CSV/Excel içe aktarma | ✅ | `importProductsCsv`, `importAccountsCsv` |
| Bildirim tercihleri + tek tık abonelikten çıkma | ✅ | `/abonelik?t=…`, `/demo/profil` kartı |
| Erişilebilirlik | ✅ (skip-link, `aria-current`, `aria-live`, kontrast) | `components/*`, `globals.css` |
| Gözlemlenebilirlik | ✅ kısmi | `/api/health`, `/super-admin/postalar` |
| Sanallaştırma / görsel optimizasyonu | ⚠️ kısmi | ilk 24 kart, `loading="lazy"` |
| Sentry / OpenTelemetry | ❌ yok | — |

Sıfır `alert` / `confirm`: tüm akışlar `Modal`, `toast` ve satır içi hata mesajlarıyla çalışıyor.

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

1. **Panel içi sabit Türkçe metin: 489 / 49 dosya.** Denetim aracı listeliyor; kapatılmadı.
   Müşteri tarafı (vitrin, kod girme, kütüphane, profil, abonelik) çevrildi.
2. **Uzun kuyruk anahtarlar 78 dilde İngilizceye düşüyor.** Çekirdek 39 anahtar 80 dilde yerel.
3. **Gerçek SMTP teslimatı** test edilmedi (SMTP yok → `skipped` yolu doğrulandı).
4. **Sentry/OpenTelemetry yok**; yalnızca audit + mail_events + `/api/health`.
5. **`next/image` + CDN yok**; `loading="lazy"`/`decoding="async"` ile yetinildi.
6. **Gerçek sanallaştırma yok** (react-virtual); sayfalama + mount-on-open ile çözüldü.
7. **Excel (.xlsx) doğrudan okuma yok**; CSV dışa aktarımı ile kullanılıyor.
8. Tarayıcıda görsel (piksel) testi yapılmadı; doğrulama HTML/HTTP responları üzerinden.

## F. Öneriler (sıradaki tur)

1. `i18n:hardcoded` çıktısını CI'da eşik kontrolüne bağla (ör. >400 ise uyarı, >0 ise kırmızı
   yalnızca "yeni dosya" kuralıyla).
2. Çekirdek paketi 39 → 80 anahtara çıkar (panel başlıkları, tablo kolonları, form etiketleri
   ilk sırada) ve `en` çevirilerini gözden geçir.
3. SMTP'yi staging'de gerçek bir sunucuyla (Mailtrap/Postmark) uçtan uca test et; bounced/
   complaint webhook'u `mail_events`'e bağla.
4. Sentry (`@sentry/nextjs`) ekle; `logAudit(severity:"error")` ve route handler hatalarını
   tek noktadan raporla.
5. `next/image` + `images.remotePatterns` ile Steam/üzgün görselleri CDN üzerinden optimize et.
6. Büyük listelerde `@tanstack/react-virtual` ile gerçek sanallaştırma (10k+ satır senaryosu).
