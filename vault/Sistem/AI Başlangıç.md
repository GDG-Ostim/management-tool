---
tur: sistem
alan: baslangic
guncelleme: 2026-10-13
ozet: "Yeni oturum için kısa bağlam ve mevcut geliştirme durumu."
---
# AI Başlangıç

- GDG Management Tool: tek topluluğun iç komite/görev aracı; public kod, Türkçe ürün.
- Plan hazır; kimlik altyapısı, kapalı giriş, davet akışı, responsive dashboard, dört şeffaf maskot pozu, maskotlu tanıtım, kullanıcı yönetimi, Resend e-posta şablonları, temel komite yönetimi, sürükle-bırak Kanban, rapor API'leri ve rapor/profil ekranları geliştirildi. Güncel iş durumu GitHub Project/Issues'ta.
- React + Express + Better Auth + better-sqlite3; minimal shadcn/ui dashboard; tek Docker servisi.
- Başkan global; komite başkanı komiteye bağlı; üye yalnız kendi görevini değiştirir. Üye kendi komitesinin bütün işlerini okur.
- İnceleme onaylı tamamlama; rapor teslim zamanına dayanır. Ayrı audit ekranı yok.
- MVP dışı: multi-tenant, açık kayıt, upload, mention, bildirim, timeline.
- Poyraz ve Türker 10'ar issue; görsel üretimi yalnız Poyraz.
- Önce çalışılan issue'yu ve ilgili rota notlarını oku. Tüm vault/asset/oturum geçmişini yükleme.
- Kullanıcı kararı ile uygulama tercihini ayır. Değişen nottan sonra index/check; committe AI ortak yazar yok.
- Rotalar: `node scripts/context.mjs auth|permissions|tasks|reports|ui|ops`.
- [Project](https://github.com/orgs/GDG-Ostim/projects/1) · [[02 - Faz Planı]] · [[Operasyon/GitHub İşleri]] · [[Operasyon/CI CD]].
