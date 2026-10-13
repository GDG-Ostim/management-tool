---
tur: mimari
alan: architecture
guncelleme: 2026-10-13
ozet: "React ve Express tek servis mimarisi, API alanları ve geliştirme sınırları."
---
# Sistem

## Yığın
Kullanıcı seçimi: React, Express.js, Better Auth, SQLite. “Better SQLite” ifadesi `better-sqlite3` Node sürücüsü olarak uygulanır.
Uygulama tercihleri: TypeScript, React + Vite SPA, Express 5, shadcn/ui; tek repo, tek Node servisi, tek SQLite dosyası. npm workspaces ile `apps/web`, `apps/api`, `packages/shared`. Bunlar henüz oluşturulmadı; ilk issue kuracak.

ORM, mesaj kuyruğu, Redis, mikroservis ve websocket eklenmez. SQL prepared statement + küçük repository/service katmanları ve sıralı migration dosyaları yeterli. Better Auth şeması kendi migration aracıyla yönetilir; uygulama tabloları ayrı tutulur.

## Dağıtım
Tarayıcı → HTTPS reverse proxy → Express (/api + React build) → kalıcı SQLite.
Resend çağrıları yalnız backend'den yapılır. Better Auth secret ve Resend anahtarı frontend'e geçmez.
Geliştirmede Vite `/api` proxy ile aynı origin davranışı sağlar; üretimde tek origin. Yüklü dependency sürümleri scaffold sırasında uyumlu seçilip lockfile'a sabitlenir.

## Modüller
auth/bootstrap, users/invitations, committees/memberships, tasks/reviews/comments/checklist/links, reports.
Her modülde input doğrulama → oturum → kaynak yetkisi → servis → DB sırası korunur. Rol/komite kapsamını frontend'den gelen veri belirlemez.

## API taslağı
| Alan | Endpoint ailesi |
| --- | --- |
| Giriş/şifre | Better Auth `/api/auth/*` |
| Oturum profili | `GET /api/me` |
| Kullanıcı | `/api/users`, `PATCH /:id` (role, active), `/:id/invite` |
| Komite | `/api/committees`, `PATCH /:id`, `PUT/DELETE /:id/members/:userId` |
| Board | `GET /api/tasks?committeeId=&assigneeId=&status=&q=` |
| Görev | `/api/tasks/:id`, `/:id/transition`, `/:id/archive` |
| Alt kaynak | `/:id/comments`, `/:id/checklist`, `/:id/links`, `/:id/reviews` |
| Rapor | `/api/reports/me`, `/api/reports/users/:id`, `/api/reports/committees/:id`, `/api/reports/overview` |

Liste uçlarında sınırlı sayfalama; board sütunlarında gerektiğinde “Daha fazla”. Standart hata şekli `{error:{code,message,fields?}}`; Türkçe kullanıcı mesajları. Kaynak değişimleri sunucu zamanı ve sürüm numarası döndürür.

Express 5 için Better Auth handler `/api/auth/*splat` altında body parser'dan önce bağlanır. API 404'leri JSON kalır; SPA fallback API hatasını HTML ile örtmez.

## İlgili notlar
[[Mimari/Veri Modeli]], [[Mimari/Kimlik ve Kurulum]], [[Sistem/Teknik Kaynaklar]], [[Operasyon/Çalıştırma ve Teslim]].
