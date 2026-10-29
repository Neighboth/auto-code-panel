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
