---
tur: sistem
alan: ops
guncelleme: 2026-10-13
ozet: "Kısa bağlam yönlendirme, staged pre-commit hook ve vault doğrulaması."
---
# AI Çalışma Düzeni

Referans: Daily projesindeki küçük frontmatter notları, harita ve Git hook düzeni. Eski ürün kararları kopyalanmadı.

## Seçerek okuma
Codex için kökte kısa AGENTS.md; Claude Code için aynı dosyaya yönlendiren CLAUDE.md. İlk komut `node scripts/context.mjs` yalnız kısa başlangıcı ve rota adlarını gösterir. Örneğin `node scripts/context.mjs tasks`, gereken notların yol/özet listesini verir. İçerik için yalnız gereken dosyalar açılır.

Bu düzen bağlama alınan metni azaltır; belirli bir token tasarrufu oranı iddia edilmez. Git hook bir oturum başlatma hook'u değildir; ajan başlangıcında otomatik çalıştığı varsayılmaz. Ortak AGENTS/CLAUDE talimatı context komutunun çalıştırılmasını ister.

## Not sözleşmesi
Her Markdown notu `tur`, `alan`, `guncelleme`, `ozet` frontmatter taşır. Notlar 25 KB altında tutulur; tarih YYYY-MM-DD. Karar tek kanonik yerde; başka nottan wiki link ile bağlanır. Kullanıcı kararları ADR'ye, uygulama davranışı ilgili ürün/mimari notuna yazılır.

## Komutlar
- `npm run vault:index`: frontmatter'dan deterministik kısa yol/özet indeksi üretir.
- `npm run vault:check`: not başlığı/frontmatter/tarih/boyut/wiki linkleri ve indeksin güncelliğini doğrular.
- `npm run hooks:install`: sadece bu repoda Git core.hooksPath ayarlar.
- pre-commit: Git index'teki staged içerikleri kontrol eder; unstaged düzeltmenin bozuk staged dosyayı gizlemesine izin vermez.
- CI: aynı vault kontrolü ve tooling testleri.

Hook dosya üretmez veya otomatik stage etmez. Hata varsa notu düzelt, index komutunu çalıştır, değişen dosyaları stage et ve yeniden commit et. Hook, node kurulu olmayan ortamda anlaşılır komut hatasıyla durur; Node >=22 gerekir. Proje uygulama bağımlılıkları kurulmadan tooling çalışır.

## Oturum kapatma
Gerçekleşenleri kısa oturum notuna yaz; önerileri yapılmış sayma. Task ilerlemesi GitHub'da kanoniktir; vault içinde ikinci bir canlı Kanban tutma. README yalnız giriş bağlantılarıdır. `.obsidian/workspace*.json`, .env, SQLite ve secret dosyaları Git dışında kalır.

Resmî Codex davranışı: [AGENTS.md rehberi](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Bu projedeki konu rotaları ve hook bizim yerel uygulamamızdır.
