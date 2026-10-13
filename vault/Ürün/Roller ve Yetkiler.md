---
tur: urun
alan: permissions
guncelleme: 2026-10-13
ozet: "Başkan, komite başkanı ve üyenin sunucu taraflı yetki sınırları."
---
# Roller ve Yetkiler

Başkan ve başkan yardımcısı aynı teknik yetkiyi kullanır: `super_admin`. Arayüz etiketi Başkan. Kurulum yalnız bir ilk başkan yaratır; sonradan aynı yetki başka kullanıcıya verilebilir. Son aktif başkan devre dışı bırakılamaz veya yetkisizleştirilemez.

Komite üyeliği `committee_memberships.role = lead | member`; global normal kullanıcı rolü `user`. Birinin A komitesinde başkan, B'de üye olması mümkündür. Global yönetici rolü komite üyeliği gerektirmez.

| İşlem | Başkan | Komite başkanı | Üye |
| --- | --- | --- | --- |
| Komite oluşturma/arşivleme | Tümü | Yok | Yok |
| Kullanıcı ekleme/pasifleştirme | Tümü | Yok | Yok |
| Rol ve üyelik yönetimi | Tümü | Yok | Yok |
| Board ve görev okuma | Tümü | Kendi komiteleri | Kendi komiteleri |
| Görev açma/atama/düzenleme | Tümü | Başkan olduğu komite | Kendine görev; kendi görevinin içeriği |
| Başkasına yeniden atama | Tümü | Başkan olduğu komite | Yok |
| İncelemeye gönderme | Tümü | Başkan olduğu komite | Kendi görevi |
| Tamamlama/ret/yeniden açma | Tümü | Başkan olduğu komite | Yok |
| Yorum yazma | Tümü | Eriştiği komite | Eriştiği komite |
| Kişisel rapor | Tümü | Kendi komitesindeki görevlerle sınırlı | Yalnız kendisi |
| Komite/genel rapor | Tümü | Başkan olduğu komite | Yok |

## Sınır durumları
- Başkan kendi rolünü veya aktifliğini değiştiremez; bunu başka bir başkan yapar. Böylece son aktif başkan kendini kilitleyemez; sunucu ayrıca son aktif başkanı transaction içinde korur.
- İstemcide düğme gizlemek yeterli değildir. Her okuma/yazma ve ilişkili alt kaynak (yorum/checklist/çıktı) sunucuda kontrol edilir.
- Komite başkanı bir üyenin profilinden başka komitelerdeki işlerine erişemez. Ortak kullanıcı ID'si bu sınırı kaldırmaz.
- Rol, üyelik veya aktiflik değiştiğinde sonraki istekte veritabanından güncel yetki alınır. Pasifleştirme oturumları iptal eder.
- Görev yalnız aynı komitedeki aktif üyeye atanabilir. Birden çok sorumlu yoktur. Komiteler arası tek görev yoktur.
- Açık görevi olan kişi komiteden çıkartılmadan önce işler başka üyeye atanır. Tamamlanmış geçmiş kalır.
- Üye kendi deadline'ını değiştiremez; oluştururken önerebilir. Sonradan deadline/öncelik/etiket değişikliği yöneticiye aittir.
- Tamamlanmış işin alanları kilitlidir; düzeltme için yeniden açılır. Üye kendi yorumunu düzenleyebilir; başkalarının yorumunu değiştiremez.
- Komite başkanı kendi görevini de onaylayabilir; çift onay MVP kapsamında değildir.
- Yok/erişilemez kaynak 404, görülebilen kaynağa yetkisiz işlem 403; oturumsuz istek 401.
