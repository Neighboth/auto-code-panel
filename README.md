# Dijital Hesap & Kod Teslimat Platformu

Multi-tenant (çoklu mağaza) otomatik kod ve hesap teslimat sistemi. Yapılandırma JSON dosyası değil,
ortam değişkenleri ile yönetilir. Veritabanı SQLite'dır.

## Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `SQLITE_PATH` | SQLite dosya yolu (`./data/app.db`) |
| `PORT` | HTTP portu (`3000`) |
| `HOST` | Dinleme adresi (`0.0.0.0` = tüm ağ arayüzleri) |
| `PORT_FALLBACK` | Port doluysa sonraki boş portu dene (`0` = kapalı) |
| `AUTH_SECRET` | Oturum imzalama anahtarı (uzun rastgele değer) |
| `SUPER_ADMIN_USERNAME` | Platform sahibi kullanıcı adı |
| `SUPER_ADMIN_PASSWORD` | Platform sahibi şifresi |
| `SUPER_ADMIN_EMAIL` | Opsiyonel giriş e-postası |
| `BRAND_NAME` | Ana site adı |
| `BRAND_TAGLINE` | Site adının altındaki slogan |
| `BRAND_LOGO_URL` | Opsiyonel logo görseli URL'si |
| `RENEWAL_URL` | Global süre uzatma linki |
| `SUPPORT_EMAIL` | Destek e-postası |
| `CRON_SECRET` | Steam senkron uç noktası sırrı |

## Yönetici girişi

Ana sitedeki **Yönetici Girişi** bağlantısı tek giriş noktasıdır (`/super-admin`).
`SUPER_ADMIN_USERNAME` veya `SUPER_ADMIN_EMAIL` ve şifre eşleşirse platform paneli açılır.
Mağaza yöneticisi kullanıcı adı/e-postası ve şifresi eşleşirse mağaza yönetici oturumu açılır
ve kullanıcı doğrudan `/:magazaSlug/admin` paneline yönlendirilir. Aynı yönetici bilgileri
birden çok mağazada kullanılıyorsa formdaki isteğe bağlı **Mağaza ID** alanı eşleşmeyi
netleştirir. Mağazaya özel `/:magazaSlug/admin/giris` ekranı da kullanılabilir.

## Yerel çalıştırma

### Tek tıkla başlatma (önerilen)

- **Windows:** `start.bat` dosyasına çift tıklayın.
- **Linux / macOS:** ilk seferde `chmod +x start.sh reset.sh` çalıştırın, sonra `./start.sh`.

`start.bat` / `start.sh` sırasıyla şunları yapar:

1. Node.js 20.9+ kurulu mu kontrol eder.
2. `.env` yoksa `.env.example` dosyasından oluşturur ve `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` ile süper admin şifresini rastgele üretir. Üretilen giriş bilgileri ekrana yazılır.
3. Eksik bağımlılıkları `npm install` ile kurar.
4. Kaynak kod değişmişse üretim derlemesini (`npm run build`) yeniler.
5. Sunucuyu aynı terminale bağlı olarak çalıştırır ve yerel ağ IP'si ile portu ekrana yazar.

Sunucu terminale bağlıdır; terminal kapatıldığında veya `CTRL + C` yapıldığında süreç de kapanır.

### Manuel çalıştırma

```bash
cp .env.example .env
npm install
npm run build
npm run start
```

Geliştirme modu: `npm run dev` (lisans enjeksiyonu geliştirme modunda da aktiftir).

## Özel alan adı

Her mağaza, `Mağaza paneline > Görünüm ve Ayarlar > Özel alan adı` bölümünden opsiyonel olarak
kendi alan adını bağlayabilir. Mağaza normalde `/:magazaSlug` önekiyle açılır; alan adı bağlandığında
`magazadi.com`, `magazadi.com/oyunlar`, `magazadi.com/admin` gibi temiz adresler kullanılır.

Bağlama adımları:

1. Alan adının **A** kaydını (veya `www` için CNAME kaydını) sunucunun IP adresine yönlendirin.
2. Mağaza panelindeki alan adı alanına domaini yazıp **Kaydet** düğmesine basın. Panel, `_pixguard.<domain>`
   için bir TXT doğrulama değeri gösterir.
3. TXT kaydını DNS sağlayıcınıza ekleyin ve **DNS doğrula** düğmesine basın. Doğrulama başarılı olduktan
   birkaç saniye sonra alan adı mağazaya yönlenir.
4. HTTPS için alan adını bir reverse proxy'ye (Caddy, Nginx, Cloudflare vb.) bağlayıp TLS sertifikası
   oluşturun. Uygulama HTTP dinler; sertifika sonlandırma proxy katmanında yapılır. Proxy, gelen
   `Host` başlığını korumalıdır.

TXT doğrulaması, alan adının gerçekten mağaza sahibine ait olduğunu kanıtlar; doğrulanmamış alan adları
sunucu tarafından mağazaya yönlendirilmez. Aynı alan adı yalnızca tek mağazaya bağlanabilir.

Davranış özeti:

- Alan adı kaydedildiğinde mağaza **slug'ı asla silinmez**; `magaza` adresi veritabanında kalır.
- Alan adı **doğrulandıktan** sonra `magazadi.com/kod-gir` gibi adresler doğrudan kullanılır ve
  eski `/:magazaSlug` bağlantıları otomatik olarak alan adına yönlendirilir.
- Alan adı **doğrulanmamışsa** slug çalışmaya devam eder; kesinti olmaz.

## Dil, tema ve para birimi

- **Dil:** Arayüz ~80 dilde sunulur. Varsayılan dil, tarayıcının `Accept-Language` başlığından
  otomatik seçilir; kullanıcı sağ üstteki bayrak menüsünden değiştirebilir (`locale` çerezi 1 yıl
  saklanır). Çeviriler `src/lib/i18n/dictionaries.ts` içindedir; eksik anahtarlar İngilizceye,
  ardından Türkçeye düşer. Yeni bir dil eklemek için `config.ts` listesine girdi ve sözlüğe
  çeviri bloğu eklemek yeterlidir.
- **Bayraklar:** Emoji değil, PNG bayrak görselleri (`flagcdn.com`, `flagUrl()` yardımcısı) kullanılır.
  Liste Türkçe ve İngilizce ile başlar, kalan diller kendi adlarıyla alfabetik sıralanır.
- **Tema:** Varsayılan her zaman **açık temadır**. Koyu tema yalnızca elle açılır (`<html data-theme>`
  + `localStorage`), sunucu ve istemci aynı temayı üretir; sayfa ilk boyamada titremez.
- **Para birimi:** Steam'den gelen fiyat, mağazanın seçili para birimine **canlı kurdan** çevrilir
  (`/api/fx`, 30 dakika önbellek, 6 saatlik sunucu önbelleği). Kur servisi erişilemezse statik
  yedek tablo kullanılır; 59 USD asla 59 TRY olarak gösterilmez. Para birimi değiştirildiğinde
  formdaki tutarlar da otomatik olarak çevrilir.

## Teslimat modeli

Paylaşımlı hesap modeli kullanılır: bir kod kullanıldığında erişim **süresiz** açılır ve hesap
"teslim edildi / durdu" durumuna geçmez. Kütüphanedeki "Hesap bilgilerini al" akışı üç adımdır:
hesap bilgileri → ek notlar → canlı 2FA/Steam Guard kodu. Bu akış hem `/kod-gir` sonucunda hem
kütüphanede aynı popup ile açılır.

## Mail üzerinden kod (IMAP)

Hesap eklerken Steam Guard yerine veya yanında **mail ile kod** alınabilir. Gmail, Outlook,
Yandex, iCloud, Zoho, Proton Bridge ve özel IMAP sunucuları desteklenir. Kod yalnızca mağaza
sahibinin belirlediği gönderici filtresine (varsayılan `steam`) uyan en yeni iletiden okunur.
Varsayılan desen `>(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{5,6}<`; eşleşme yoksa bilinen
alternatif desenler denenir. "Kodu test et" düğmesi kaydetmeden önce Guard/TOTP/mail kodunu
gösterir.

## Duyurular ve güncelleme notları

Platform sahibi `/super-admin/duyurular` sayfasından duyuru veya güncelleme notu yayınlayabilir.
Kayıtlar tüm mağaza yöneticilerinin **Genel Bakış** panelinde iki büyük kutu içinde gösterilir:
**Duyurular** ve **Güncelleme Notları**. Kayıtlar sabitlenebilir, düzenlenebilir ve silinebilir.
Güncelleme notlarına opsiyonel sürüm etiketi (`v2.4.0` gibi) eklenebilir; içerik Markdown destekler.

## İstatistikler

Mağaza yöneticisi `Mağaza paneline > İstatistikler` sayfasından 7 / 30 / 90 günlük aralıklarla
detaylı raporları görüntüleyebilir: kod kullanım oranı, günlük redemption ve teslimat grafikleri,
müşteri büyümesi, saatlik/günlük yoğunluk, ürün ve müşteri sıralamaları, envanter dağılımı, süresi
yaklaşan teslimatlar ve son işlemler. "Tahmini teslim değeri" yalnızca oyunların mağaza liste fiyatına
göre hesaplanır; gerçek tahsilat veya kâr raporu değildir.


## E-posta, doğrulama ve bildirimler

SMTP **opsiyoneldir**. `SMTP_HOST` + `SMTP_FROM` tanımlıysa:

- Kayıtta e-posta doğrulama zorunlu olur (6 haneli kod, 15 dk, 6 deneme, magic link
  `/{magaza}/dogrula?t=...` sadece kodu gösterir, otomatik oturum açmaz).
- Girişte doğrulanmamış hesaba yeni kod gönderilir (3 istek / 5 dk).
- E-posta ile 2FA faktörü kullanılabilir (4 istek / 5 dk).
- Olay mailleri: mağaza açılışı, duyuru/güncelleme (yalnızca **aktif** mağazalara),
  lisans bitimine 3 ve 1 gün kala hatırlatma, kod kullanımında teslim fişi.

Tanımlı değilse hiçbir e-posta denenmez, akış kilitlenmez; panelde
`/super-admin/postalar` üzerinden SMTP durumunu görüp test e-postası gönderebilirsiniz.

### Zamanlanmış görevler

```bash
# Lisans hatırlatmaları — saatte bir çalıştırmak güvenli (mail_events tekilleştirir)
curl -fsS "https://alan-adi/api/cron/reminders?secret=$CRON_SECRET"

# Steam fiyat/kapak senkronizasyonu — 6 saatte bir
curl -fsS "https://alan-adi/api/cron/steam-sync?secret=$CRON_SECRET"
```

### Bildirim tercihleri (KVKK / GDPR)

Her e-postanın altında o adrese özel, imzalı tek tıkla kapatma bağlantısı bulunur
(`/abonelik?t=...`). Müşteriler tercihlerini **Profil → E-posta bildirimleri**,
mağaza yöneticileri **Ayarlar → E-posta bildirimleri** altından da yönetebilir.

## Toplu işlemler ve içe aktarma

- Ürünler / hesaplar: **CSV içe aktar** (şablon indirilebilir, en fazla 300 satır).
- Kodlar: çoklu seçim, kopyalama, seçilenleri silme (kullanılmış kodlar korunur).
- Müşteriler: çoklu yasaklama / yasak kaldırma / kalıcı silme.
- Ürünler: yüzde veya tutar bazlı toplu fiyat güncelleme.

## Denetim kaydı

Her işlem (girişler, CRUD, toplu işlemler, ayarlar, mail gönderimleri, şifre
görüntüleme) aktör, IP ve tarayıcı bilgisiyle saklanır. `/super-admin/loglar`
üzerinden filtrelenir, satır detayında JSON görüntülenir ve CSV indirilebilir.

## Erişilebilirlik ve performans

- Klavye ile tam gezinme: "İçeriğe geç" bağlantısı, `:focus-visible` halkaları,
  modal içinde odak tuzağı ve kapanışta odağın geri verilmesi, `aria-current` ve
  `aria-labelledby` etiketleri, `prefers-reduced-motion` desteği.
- Uzun listelerde `content-visibility: auto`, ürün ızgarasında kademeli render
  (ilk 24 kart), görsellerde `loading="lazy"` + `decoding="async"`.
- Sıcak sorgular için indeksler (`games`, `codes`, `customers`, `entitlements`…).
- `/api/health?verbose=1` sürüm, commit, çalışma süresi ve mail durumunu döndürür.

## Çeviri kapsamı

```bash
npm run i18n:coverage          # dil dil kapsam raporu
npm run i18n:coverage -- --json
```

Durum (v1.4.0):

| Katman | Anahtar | Dil |
| --- | --- | --- |
| Referans sözlük (`dictionaries.ts` + `ui-extra.ts`) | 1230 | `tr`, `en` (tam) |
| Çekirdek paket (`core-packs.ts`) | 39 | 80 dilin **tamamı** |

`tr` ve `en` 1230 anahtarın tamamına sahiptir. Kayıtlı 80 dilin her biri menü,
giriş/kayıt, kod girme, "kalan süre", "kopyala", "çıkış" gibi her ekranda görünen
39 anahtarı **kendi dilinde** gösterir; bu anahtarlarda İngilizceye düşme yoktur.
Çekirdek pakette bulunmayan uzun kuyruk anahtarlar (panel tabloları, form
etiketleri) `tr`/`en` dışındaki dillerde **İngilizceye** düşer — ham anahtar adı
hiçbir koşulda görünmez.

Çeviri eklemek için `src/lib/i18n/core-packs.ts` içindeki ilgili dil nesnesine
anahtar eklemek yeterlidir (`tr`/`en` dışındaki dillerde eksik anahtar otomatik
olarak İngilizceye düşer). Şablon değişkenleri `{ad}` biçimindedir:

```ts
t("x.kod-email-adresine-gonderildi", { email: "a@b.c" });
```

```bash
npm run i18n:coverage        # dil dil kapsam raporu
npm run i18n:hardcoded       # sabit metin denetimi (UI + sunucu tarafı)
npm run i18n:hardcoded -- --json
```

`i18n:hardcoded` bir denetim aracıdır, derlemeyi düşürmez. İki sayı verir:

- **Sabit (çevrilmemiş) Türkçe metin** — JSX içinde doğrudan yazılmış metin.
  v1.4.0 itibarıyla **0**.
- **Sunucu tarafı Türkçe metin** — yalnızca süper yönetici panelinde görünen
  audit-log özetleri (`summary:`) ve birkaç iç yardımcı mesajı. v1.4.0
  itibarıyla 43 metin / 11 dosya. Bunlar veritabanına yazıldığı için çeviri
  yazma anında değil, gösterim anında yapılmalıdır; yapılandırılmış log
  (`summary_key` + `summary_params`) işi sonraki sürüme bırakıldı.

Kapsam ayrıca `/super-admin/ayarlar` sayfasındaki "Dil kapsamı" kartında canlı
olarak gösterilir.

## Lisans

Kaynak dosyalardaki lisans blokları kaldırıldı. Tek kaynak artık **`src/LICENSE`** dosyasıdır.
`server.js`, bu dosyayı her HTML yanıtının en başına, `<!DOCTYPE html>` etiketinden bile önce
HTML yorumu olarak ekler. Böylece tarayıcıda `CTRL + U` ile kaynak kodu görüntülendiğinde lisans
tüm sayfalarda en üstte görünür. `src/LICENSE` dosyasını düzenlemeniz yeterlidir; değişiklik bir
sonraki sayfa isteğinde otomatik olarak yansır, yeniden derleme gerekmez.

## Sıfırlama

- **Windows:** `reset.bat`
- **Linux / macOS:** `./reset.sh`

Bu işlem onay istedikten sonra tüm `.env` dosyalarını (`.env.example` hariç) ve SQLite veritabanı
dosyalarını (`*.db`, `-wal`, `-shm`, `-journal`) siler. Bir sonraki `start.bat` / `start.sh`
çalıştırmasında `.env` ve veritabanı ilk günkü haliyle yeniden oluşturulur. Onay sormadan
çalıştırmak için `reset.bat -y` veya `./reset.sh -y` kullanılabilir.

## GitHub Actions ve konteyner imajı

`.github/workflows/docker-publish.yml` iki iş çalıştırır:

1. **verify:** bağımlılıkları kurar, `npm run typecheck`, `npm run lint` ve `npm run build` çalıştırır.
2. **publish:** `main` dalına yapılan her push'ta (veya **Actions > Run workflow** ile elle)
   çok mimarili (`linux/amd64`, `linux/arm64`) imajı derleyip GHCR'ye gönderir:
   `ghcr.io/<kullanici>/<repo>:latest`, `:sha-<kısa>`, `:main`.

Dockerfile Alpine yerine projenin kendi Node.js tabanını (`node:22-bookworm-slim`) kullanır;
`docker-compose.yml` varsayılan olarak GHCR imajını çeker, yerel derleme için
`docker compose up -d --build` yeterlidir. Sandbox/ağ kısıtlaması olan ortamlarda imaj derlemesi
GitHub Actions üzerinde yapılabilir; sunucuda yalnızca `docker compose pull && docker compose up -d`
çalıştırmak gerekir.

## Docker / CasaOS

`docker-compose.yml` tek başına çalışacak şekilde yazıldı; tüm ayarlar compose içindeki
`${DEĞİŞKEN:-varsayılan}` kalıplarıyla tanımlı. Yani `.env` dosyası olmadan da ayağa kalkar.

CasaOS'te "Custom App" (veya App Store > Custom) ekranına compose içeriğini yapıştırmak için
proje dosyalarının (özellikle `Dockerfile`) compose ile aynı klasörde olması gerekir. CasaOS compose'u
`/DATA/AppData/<uygulama>/docker-compose.yml` altına yazar ve `docker compose up -d` çalıştırır.
Bu nedenle:

1. Proje klasörünü CasaOS sunucusunda `/DATA/AppData/delivery-app` altına kopyalayın.
2. CasaOS > App Store > Custom > "Import" ile `docker-compose.yml` dosyasını seçin
   (veya compose içeriğini yapıştırın).
3. `AUTH_SECRET`, `SUPER_ADMIN_PASSWORD`, `BRAND_NAME`, `BRAND_TAGLINE` değerlerini düzenleyin.
4. Uygulamayı başlatın; `http://SUNUCU_IP:3000` adresinden erişin.

SQLite verisi `app-data` Docker volume'unda tutulur, konteyner yeniden başlasa da korunur.
