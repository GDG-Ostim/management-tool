---
tur: sistem
alan: baslangic
guncelleme: 2026-10-13
ozet: "Yeni oturum için kısa bağlam ve mevcut geliştirme durumu."
---
# AI Başlangıç

- GDG Management Tool: tek topluluğun iç komite/görev aracı; public kod, Türkçe ürün.
- MVP'nin 20 işi tamamlandı: kapalı giriş ve davet, kullanıcı/komite yönetimi, sürükle-bırak Kanban, görev detayı (etiket, kontrol listesi, çıktı, yorum), inceleme/ret/yeniden açma geçmişi, arşiv, kişi/komite/genel raporlar, maskotlu tanıtım, Docker Compose ve yedek/geri yükleme. Testler: `npm test`, `npm run test:e2e`, CI Docker duman testi. Yeni işler GitHub Issues'ta.
- React + Express + Better Auth + better-sqlite3; shadcn/ui yaklaşımıyla repo içi sade bileşenler; tek Docker servisi.
- Başkan global; komite başkanı komiteye bağlı; üye yalnız kendi görevini değiştirir. Üye kendi komitesinin bütün işlerini okur.
- İnceleme onaylı tamamlama; rapor teslim zamanına dayanır. Ayrı audit ekranı yok.
- MVP dışı: multi-tenant, açık kayıt, upload, mention, bildirim, timeline.
- Tek geliştirici: bütün issue'lar Poyraz'da (2026-10-14'ten beri; Türker projede yer almıyor).
- Önce çalışılan issue'yu ve ilgili rota notlarını oku. Tüm vault/asset/oturum geçmişini yükleme.
- Kullanıcı kararı ile uygulama tercihini ayır. Değişen nottan sonra index/check; committe AI ortak yazar yok.
- Rotalar: `node scripts/context.mjs auth|permissions|tasks|reports|ui|ops`.
- [Project](https://github.com/orgs/GDG-Ostim/projects/1) · [[02 - Faz Planı]] · [[Operasyon/GitHub İşleri]] · [[Operasyon/CI CD]].
