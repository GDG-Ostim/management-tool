# GDG Management Tool

GDG OSTİM için tek topluluklu komite ve görev yönetimi. React, Express, Better Auth ve SQLite ile geliştirilecek Türkçe dashboard.

**Durum:** Kimlik altyapısı, kapalı giriş ve kullanıcı daveti akışı hazır; kalan geliştirme GitHub issue'larında.

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

Uygulama varsayılan olarak `http://localhost:5173` adresinde açılır. API `http://localhost:3000` üzerinde çalışır; Vite geliştirme sunucusu `/api` isteklerini API'ye yönlendirir.

## Doğrulama

```sh
npm run vault:index
npm run vault:check
npm test
npm run build
```

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
