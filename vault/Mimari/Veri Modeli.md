---
tur: mimari
alan: architecture
guncelleme: 2026-10-13
ozet: "Minimal SQLite tabloları ve geçmişi koruyan ilişkiler."
---
# Veri Modeli

Bu şema uygulama sözleşmesidir. `001-identity` ve `002-committees-tasks` migration'ları user_profiles, invitations, committees, committee_memberships, tasks, task_submissions ve task_reopens tablolarını kurdu; yorum, checklist, bağlantı ve etiket tabloları ilgili issue'larda eklenecek. ID'ler opaque string; tüm tarihler UTC. Bir task tam bir komiteye aittir; tenant/organization tablosu gerekmez.

| Tablo | Ana alanlar |
| --- | --- |
| Better Auth tabloları | user, session, account, verification; kütüphanenin oluşturduğu şema |
| user_profiles | user_id PK/FK, active, onboarding_completed_at |
| committees | id, name UNIQUE, description, archived_at |
| committee_memberships | committee_id + user_id UNIQUE, role lead/member |
| tasks | id, committee_id, title, description, assignee_id, created_by, status, priority, due_at, version, archived_at, created_at, updated_at, completed_at, approved_submission_id |
| task_submissions | id, task_id, submitted_at, submitted_by, assignee_id_snapshot, due_at_snapshot, resolution pending/approved/rejected/withdrawn, resolved_at, resolved_by, reason |
| task_reopens | id, task_id, previous_submission_id, actor_id, reason, created_at |
| task_comments | id, task_id, author_id, body, created_at, updated_at |
| task_checklist_items | id, task_id, text, checked, position |
| task_links | id, task_id, url, label |
| labels / task_labels | id + committee_id + name; task_id + label_id UNIQUE |
| invitations | user_id, state pending/sent/failed/accepted, last_attempt_at, sent_at, accepted_at; token burada tutulmaz |
| app_settings | key PK, value; bootstrap tamamlandı işareti |
| schema_migrations | version PK, applied_at |

Global admin/user rolü Better Auth admin plugin rol alanında tutulur; komite rolleri plugin'in global rolüne taşınmaz. Kütüphanenin iç şema/alan isimlerini kendi migration'ımızla değiştirmeyiz.

## Kısıtlar
- Foreign keys açık; referanslı kullanıcı veya tamamlanmış görev hard-delete edilmez.
- Aynı komitede aynı üyelik/etiket yinelenmez. Rol ve durum CHECK kısıtları.
- Her task için en çok bir pending submission; onaylanan submission aynı task'a ait olmalı.
- Aktif tek başkanın kaldırılması transaction içinde engellenir.
- Durum + submission + completed_at + version birlikte güncellenir. İki eşzamanlı onaydan biri başarılı olur.
- `committee_id/status`, `assignee_id/status`, `due_at`, `task_id` geçmiş alanları ve membership user_id indekslenir.
- Arşivlenen komite yeni görev/davet kabul etmez; açık görev varken arşivleme önce işleri çözmeyi ister. Geçmiş raporlar kalır.
- Auth verisi ile uygulama profili ayrışırsa servis güvenli biçimde reddeder; provisioning işlemi tekrar çalıştırılabilir olmalıdır.

İnceleme snapshot alanları [[Ürün/Raporlar]] hesabını sabit tutar. Ad/e-posta gibi kişisel veriler issue veya public vault'a taşınmaz.
