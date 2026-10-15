# GDG Management Tool

GDG OSTİM için tek topluluklu komite ve görev yönetimi: React, Express, Better Auth ve SQLite ile Türkçe, responsive bir çalışma alanı.

**Durum:** MVP tamamlandı.

- **Hesaplar:** Başkan kullanıcıları davet eder (Resend). Herkese açık kayıt yoktur.
- **Komiteler ve panolar:** Komiteler kurulur, başkan ve üyeler atanır. Her komitenin sürükle-bırak Kanban panosu vardır.
- **Görevler:** Etiket, kontrol listesi, çıktı bağlantısı ve yorum taşır. Komite başkanı inceleyip onaylar, reddeder veya yeniden açar; geçmiş korunur.
- **Raporlar:** Kişi, komite ve genel raporlar teslim zamanına göre zamanında/geç sayar.
- **Kurulum:** Tek Docker servisi, kalıcı SQLite, yedek ve geri yükleme.
- **İletişim:** Görüntüleme yetkin olan kişilerin e-postaları tıklanabilir mailto bağlantılarıdır.
- **PWA:** Cihaza kurulum, Profilim ekranında kurulum yardımı ve bağlantı kesilince Türkçe ekran. Görev işlemleri için internet gerekir. Push bildirimleri sonraki fazlardadır; [fazlı plan](vault/Ürün/PWA%20ve%20Bildirimler.md).

- [Public Kanban](https://github.com/orgs/GDG-Ostim/projects/1)
- [Geliştirme işleri](https://github.com/GDG-Ostim/management-tool/issues)
- [Vault başlangıcı](vault/00%20-%20Başlangıç.md)
- [Faz planı](vault/02%20-%20Faz%20Planı.md)
- [Vault haritası](vault/Harita.md)

Obsidian'da bu reponun `vault` klasörünü kasa olarak açın. Notlar Türkçedir; kişisel workspace ayarları paylaşılmaz.

## Yerel geliştirme

Node.js 22.12 veya üzeriyle:

```sh
npm ci
copy .env.example .env
npm run context
npm run hooks:install
npm run bootstrap
npm run dev
```

Bootstrap şifresini `.env` içine yazmayın. `BOOTSTRAP_ADMIN_PASSWORD_FILE`, repodan dışlanan ve yalnız ilk kurulumda kullanılan bir dosyayı göstermelidir. `npm run bootstrap` tekrar çalıştırıldığında mevcut başkan hesabını veya şifresini değiştirmez.

Uygulama `http://127.0.0.1:5173` adresinde açılır. API `127.0.0.1:3000` üzerinde çalışır; Vite geliştirme sunucusu `/api` isteklerini API'ye yönlendirir. Tarayıcıdaki adres `.env` içindeki `APP_URL` ile birebir aynı olmalıdır: API başka origin'den gelen yazma isteklerini reddeder, bu yüzden `localhost` ile açılan sayfada giriş çalışmaz.

Proje yapısı:
- `apps/api`: Express API, Better Auth ve SQLite migration'ları; testler `apps/api/test` altında.
- `apps/web`: React + Vite arayüzü.
- `packages/shared`: İki uygulamanın ortak tipleri.
- `e2e`: Playwright ile uçtan uca akış.
- `vault`: Ürün ve mimari kararları.

## Doğrulama

```sh
npm run vault:index
npm run vault:check
npm run typecheck
npm test
npm run test:e2e
npm run build
```

`npm run test:e2e` web uygulamasını derler ve gerçek uygulamayı geçici bir veritabanıyla açar. Davetten rapora kadar akışı Chromium'da yürütür (ilk kullanımda `npx playwright install chromium` gerekir). CI bunlara ek olarak Docker duman testini çalıştırır.

Not güncellendiğinde `npm run vault:index` çalıştırın ve indeksi de commit'e ekleyin. Codex ve Claude Code için ortak kurallar [AGENTS.md](AGENTS.md) içindedir.

## Üretim kurulumu (Docker Compose)

Tek servis ve tek SQLite dosyası. Uygulama yalnız `127.0.0.1:3000` adresinde açılır; HTTPS'i önündeki reverse proxy (Caddy, nginx vb.) sağlar.

1. `.env.example` dosyasını `.env` olarak kopyalayın ve doldurun:
   - `APP_URL`: `https://…` biçiminde, kullanıcıların açacağı adres.
   - `BETTER_AUTH_SECRET`: rastgele bir değer (`openssl rand -hex 32`).
   - `RESEND_API_KEY` ve `MAIL_FROM`.
   - `BOOTSTRAP_ADMIN_EMAIL` ve `BOOTSTRAP_ADMIN_NAME`.
2. İlk başkanın şifresini (16–128 karakter) `secrets/bootstrap-password.txt` dosyasına yazın. Dosya Git dışındadır ve konteynere Docker secret olarak bağlanır.
3. Uygulamayı başlatın:

   ```sh
   docker compose up -d --build
   ```

   Her açılış sırasıyla şunları yapar:
   - Veritabanı varsa önce `/data/backups/startup-*.sqlite` yedeğini alır (son 10 yedek tutulur).
   - Migration'ları çalıştırır.
   - Boş kurulumda ilk başkanı bir kez oluşturur.
   - Sunucuyu başlatır.

   Konteyner `node` kullanıcısıyla ve salt okunur dosya sistemiyle çalışır; veri `gdg-data` volume'ündedir. Yeniden başlatma kullanıcıları, şifreleri ve veriyi sıfırlamaz.
4. İlk girişten sonra şifre dosyasını silebilir, şifreyi Profilim ekranından değiştirebilirsiniz.

Reverse proxy, istemci adresini `X-Forwarded-For` başlığına kendisi yazmalıdır; giriş denemesi sınırı bu başlığa göre uygulanır. Örneğin nginx'te `proxy_set_header X-Forwarded-For $remote_addr;` kullanın. İstemcinin gönderdiği başlığı olduğu gibi aktarmayın; aksi hâlde sınır atlatılabilir.

### Yedekleme ve geri yükleme

Yedek, SQLite'ın canlı yedekleme API'siyle alınır ve tek dosyadır. Servis çalışırken alınabilir:

```sh
docker compose exec app node apps/api/dist/backup-cli.js
```

Komut yedeği `/data/backups/gdg-<zaman>.sqlite` olarak yazar ve dosya yolunu basar. Yedeği sunucu dışına almak için:

```sh
docker compose cp app:/data/backups ./backups
```

Canlı WAL veritabanında yalnız `.sqlite` dosyasını kopyalamak yedek sayılmaz.

Geri yükleme yalnız servis durdurulmuşken yapılır. Yedek önce doğrulanır, mevcut veritabanı da `before-restore-*.sqlite` olarak saklanır:

```sh
docker compose stop app
docker compose run --rm --no-deps app node apps/api/dist/restore-cli.js /data/backups/<dosya>.sqlite --yes
docker compose up -d
```

Yerelde aynı işlemler `npm run backup` ve `npm run restore -- <dosya> --yes` komutlarıyla yapılır. CI'daki `scripts/docker-smoke.sh` derleme, ilk açılış, yeniden başlatma, yedek ve geri yükleme adımlarını her PR'da dener.

Başka kulüpler kodu kendi kurulumlarına uyarlayabilir; çok topluluklu SaaS akışı hedeflenmez.
