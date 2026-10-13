# GDG Management Tool

GDG OSTİM için tek topluluklu komite ve görev yönetimi. React, Express, Better Auth ve SQLite ile geliştirilecek Türkçe dashboard.

**Durum:** Plan hazır; uygulama geliştirmesi GitHub issue'larında.

- [Public Kanban](https://github.com/orgs/GDG-Ostim/projects/1)
- [Geliştirme işleri](https://github.com/GDG-Ostim/management-tool/issues)
- [Vault başlangıcı](vault/00%20-%20Başlangıç.md)
- [Faz planı](vault/02%20-%20Faz%20Planı.md)
- [Vault haritası](vault/Harita.md)

Obsidian'da bu reponun `vault` klasörünü kasa olarak açın. Notlar Türkçedir; kişisel workspace ayarları paylaşılmaz.

## Çalışmaya başlama

Node.js 22 veya üzeriyle, bağımlılık kurmadan:

```sh
npm run context
npm run context -- tasks
npm run hooks:install
npm run vault:check
npm run test:tooling
```

Not güncellendiğinde `npm run vault:index` çalıştırın ve indeksi de commit'e ekleyin. Codex ve Claude Code için ortak kurallar [AGENTS.md](AGENTS.md) içindedir.

Uygulama kurulum komutları Docker teslim işi tamamlandığında eklenecek. Başka kulüpler kodu kendi kurulumlarına uyarlayabilir; çok topluluklu SaaS akışı hedeflenmez.
