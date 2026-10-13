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

Üretim için Docker Compose teslimi #19 kapsamında tamamlanacak. Başka kulüpler kodu kendi kurulumlarına uyarlayabilir; çok topluluklu SaaS akışı hedeflenmez.
