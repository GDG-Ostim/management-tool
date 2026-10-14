---
tur: operasyon
alan: ops
guncelleme: 2026-10-13
ozet: "Public Project, kısa issue listesi ve 10/10 sorumluluk dağılımı."
---
# GitHub İşleri

[Public Kanban Project](https://github.com/orgs/GDG-Ostim/projects/1) · [Repo](https://github.com/GDG-Ostim/management-tool)

Sorumlu: Poyraz `poyrazavsever`. İlk planda 20 iş Poyraz ve Türker arasında 10/10 bölünmüştü; 2026-10-14'te Türker projeden ayrıldı ve açık işleri Poyraz'a atandı. Görsel üretim işi yalnız Poyraz'dadır.

Issue açıklamaları kısa iş tanımı + kanonik vault bağlantısı taşır. Kapsam ayrıntıları notlarda; issue'larda tekrar edilmez. Planlama kurulumu geliştirme issue'su sayılmaz. Durum GitHub'da kanoniktir.

| İş | Sorumlu | Plan |
| --- | --- | --- |
| [#1](https://github.com/GDG-Ostim/management-tool/issues/1) — [Faz 1] Proje iskeletini ve geliştirme komutlarını kur | poyrazavsever | [[Mimari/Sistem]] |
| [#2](https://github.com/GDG-Ostim/management-tool/issues/2) — [Faz 1] SQLite veri modelini ve migration altyapısını kur | poyrazavsever | [[Mimari/Veri Modeli]] |
| [#3](https://github.com/GDG-Ostim/management-tool/issues/3) — [Faz 1] Better Auth giriş ve şifre ekranlarını kur | poyrazavsever | [[Mimari/Kimlik ve Kurulum]] |
| [#4](https://github.com/GDG-Ostim/management-tool/issues/4) — [Faz 1] İlk başkan ve Resend davet akışını kur | poyrazavsever | [[Mimari/Kimlik ve Kurulum]] |
| [#5](https://github.com/GDG-Ostim/management-tool/issues/5) — [Faz 1] Komite bazlı yetki kontrollerini kur | poyrazavsever | [[Ürün/Roller ve Yetkiler]] |
| [#6](https://github.com/GDG-Ostim/management-tool/issues/6) — [Faz 2] Minimal dashboard iskeletini oluştur | poyrazavsever | [[Tasarım/Arayüz]] |
| [#7](https://github.com/GDG-Ostim/management-tool/issues/7) — [Faz 2] Komite ve üyelik yönetimini geliştir | poyrazavsever | [[Ürün/Roller ve Yetkiler]] |
| [#8](https://github.com/GDG-Ostim/management-tool/issues/8) — [Faz 2] Kullanıcı yönetimi ekranını geliştir | poyrazavsever | [[Tasarım/Ekranlar]] |
| [#9](https://github.com/GDG-Ostim/management-tool/issues/9) — [Faz 3] Görev API ve alanlarını geliştir | poyrazavsever | [[Ürün/Görev Akışı]] |
| [#10](https://github.com/GDG-Ostim/management-tool/issues/10) — [Faz 3] Sürükle bırak Kanban panolarını geliştir | poyrazavsever | [[Ürün/Görev Akışı]] |
| [#11](https://github.com/GDG-Ostim/management-tool/issues/11) — [Faz 3] Görev detayını yorumlar ve çıktılarla tamamla | poyrazavsever | [[Tasarım/Ekranlar]] |
| [#12](https://github.com/GDG-Ostim/management-tool/issues/12) — [Faz 3] İnceleme onayı ve yeniden açma akışını geliştir | poyrazavsever | [[Ürün/Görev Akışı]] |
| [#13](https://github.com/GDG-Ostim/management-tool/issues/13) — [Faz 4] Kişi komite ve genel rapor API'lerini geliştir | poyrazavsever | [[Ürün/Raporlar]] |
| [#14](https://github.com/GDG-Ostim/management-tool/issues/14) — [Faz 4] Profil raporlar ve genel bakış ekranlarını geliştir | poyrazavsever | [[Ürün/Raporlar]] |
| [#15](https://github.com/GDG-Ostim/management-tool/issues/15) — [Faz 4] Higgsfield ile maskot görsel paketini hazırla | poyrazavsever | [[Tasarım/Maskot ve Varlıklar]] |
| [#16](https://github.com/GDG-Ostim/management-tool/issues/16) — [Faz 4] Maskotlu tanıtım ve yardım alanını ekle | poyrazavsever | [[Tasarım/Ekranlar]] |
| [#17](https://github.com/GDG-Ostim/management-tool/issues/17) — [Faz 5] Yetki ve iş kuralları entegrasyon testlerini tamamla | poyrazavsever | [[Operasyon/Çalıştırma ve Teslim]] |
| [#18](https://github.com/GDG-Ostim/management-tool/issues/18) — [Faz 5] Uçtan uca akışları ve mobil kullanımı doğrula | poyrazavsever | [[Operasyon/Çalıştırma ve Teslim]] |
| [#19](https://github.com/GDG-Ostim/management-tool/issues/19) — [Faz 5] Docker Compose ve veri yedeklemeyi tamamla | poyrazavsever | [[Operasyon/Çalıştırma ve Teslim]] |
| [#20](https://github.com/GDG-Ostim/management-tool/issues/20) — [Faz 5] MVP entegrasyonunu ve son teslimi tamamla | poyrazavsever | [[01 - MVP Kapsamı]] |

Board sütunları Yapılacak, Devam ediyor, İncelemede, Tamamlandı. 20 issue oluşturuldu ve Project'e bağlandı; başlangıç durumları Yapılacak. Bir işe başlanınca sahibi durumu günceller; çalışan teslim ve ilgili kontrol sonrası issue kapanır. GitHub'ın Item closed otomasyonu etkin; Tamamlandı seçeneğinin mevcut kimliği korundu. Bu otomasyon uygulamadaki kullanıcı görevleriyle ilgili değildir.

Branch önerisi: `feat/<issue>-kisa-ad`. PR açıklaması kısa ve kapanacak issue bağlantılıdır. Commit mevcut geliştiricinin kimliğiyle yapılır; AI ortak yazarlığı eklenmez. Geliştirme tek kişiyle full-stack yürür.
