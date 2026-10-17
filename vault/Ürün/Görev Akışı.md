---
tur: urun
alan: tasks
guncelleme: 2026-10-17
ozet: "Kanban geçişleri, görev alanları, inceleme ve yeniden açma davranışı."
---
# Görev Akışı

## Uygulama durumu
Komite/üyelik ve görev tabloları `002-committees-tasks` migration'ıyla kuruldu. `/api/tasks` listeleme, açma, düzenleme ve `/transition` uçları bu nottaki geçiş tablosunu sunucuda uygular; her kart `permissions.moves` ile kullanıcının yapabileceği geçişleri döndürür. Yeni görev oluşturulurken komite başkanı veya genel başkan birden fazla aktif üyeyi onay kutularıyla veya “Herkese ata” düğmesiyle seçerek aynı görevi seçilen her kişiye bağımsız olarak tek seferde açabilir (`assigneeIds`); üye ise yalnız kendine açar. Panolar ekranı komite seçimi (başkanda Tüm komiteler), başlık araması ve sorumlu filtresiyle dört sütunu gösterir. Kart sürüklenebilir; aynı geçişler kart menüsünden klavye/mobil için de yapılır. Ret ve yeniden açma gerekçe diyaloğu ister; onay kısa kutlama maskotlu toast gösterir. Başarısız taşıma kartı eski sütuna döndürür, sürüm çakışması güncel kartı yükler. Sütunlar sığmadığında pano yatay kaydırılır: gizli içerik olan kenarda yumuşak soluklaşma ve (fareli cihazda) kaydırma düğmesi görünür; scrollbar ince ve yuvarlatılmıştır. Görev penceresi alan düzenlemenin altında kısa inceleme geçmişini gösterir (`GET /api/tasks/:id/reviews`: teslimler, sonuçları, ret/yeniden açma gerekçeleri; komiteyi okuyabilen herkes görür). Ret veya yeniden açmayla geri dönen açık kart `returned` alanıyla “Düzeltme istendi”/“Yeniden açıldı” rozeti taşır; yeni teslim veya geri çekme rozeti kaldırır. Pencerenin sağ yarısı (dar ekranda altı) etiket, kontrol listesi, çıktı bağlantısı ve yorumları gösterir; hepsi `/api/tasks/:id/details` ve alt uçlardan gelir, her değişiklik güncel detay durumunu döndürür. Kontrol listesi ve bağlantılar görevin düzenleme kuralını izler (sorumlu veya yönetici, incelemede/tamamlandıysa kilitli); etiketleri yalnız yönetici belirler ve yeni ad komite etiketi olur. Yorumu komiteyi okuyan herkes yazar, yalnız yazarı düzenler veya siler; kilitli görevde de yorum yapılır. Sınırlar: 50 madde (300 karakter), 20 bağlantı, 10 etiket (30 karakter), yorum 5.000 karakter. Bağlantı yalnız kimlik bilgisi içermeyen http/https adresidir ve yeni sekmede `noopener noreferrer` ile açılır.

Her komitenin bir board'u vardır. Başkan aynı dört sütunda tüm komitelerin görevlerini komite filtresiyle görebilir. Kartlarda komite adı, başlık, sorumlu, varsa deadline ve öncelik görünür. Metin araması, sorumlu ve durum filtreleri yeterlidir.

## Alanlar
Zorunlu: başlık (1–160 karakter), komite, tek aktif sorumlu. Komite açık board'dan gelir; üyenin sorumlusu kendisidir.
Opsiyonel: açıklama (düz metin, en çok 10.000 karakter), düşük/normal/yüksek öncelik (varsayılan normal), deadline, etiketler, checklist, çıktı URL'leri. URL yalnız http/https; dosya yüklenmez, sunucu URL içeriğini çekmez. Yorumlar düz metindir (1–5.000 karakter).

## Geçişler
| Mevcut | Sonraki | Kim |
| --- | --- | --- |
| Yapılacak | Devam ediyor | Sorumlu veya yetkili yönetici |
| Devam ediyor | Yapılacak | Sorumlu veya yetkili yönetici |
| Yapılacak / Devam ediyor | İncelemede | Sorumlu veya yetkili yönetici |
| İncelemede | Devam ediyor | Sorumlu teslimini geri çekebilir; yönetici gerekçeyle reddedebilir |
| İncelemede | Tamamlandı | İlgili komite başkanı veya başkan |
| Tamamlandı | Devam ediyor | İlgili komite başkanı veya başkan; gerekçe gerekir |

Doğrudan Yapılacak/Devam ediyor → Tamamlandı yasak. Aynı duruma tekrar istek sayaç/olay üretmez. Üye kartı Tamamlandı'ya sürükleyemez. DnD yanında klavye/mobil için durum menüsü bulunur. İncelemede görev içeriği kilitlenir; güncellemek isteyen sorumlu geri çeker. Yorum yapılabilir.

## İnceleme kaydı
Her teslimde `submitted_at`, `submitted_by`, `due_at_snapshot`, `assignee_id_snapshot` tutulur. Onay o teslimi referans alır; tamamlayan ve tamamlanma zamanı ayrı kaydedilir. Ret ve yeniden açma gerekçesi korunur. Genel hareket akışı ekranı yok; görev detayında bu kısa inceleme geçmişi, profilde ret/yeniden açma bilgisi gösterilir.

İncelemede deadline ve sorumlu değiştirilemez. Ret/geri çekme sonrası alanlar yönetici tarafından güncellenebilir; yeni teslim yeni deadline görüntüsünü alır. Eski teslim kayıtları değişmez.

## Veri tutarlılığı
Durum değişikliği, teslim kaydı ve görevin güncel alanları tek transaction'da yazılır. Görev `version` alanı taşır; istemci eski sürümü gönderirse 409 ve güncel kart geri gelir. Başarısız sürükleme eski konuma döner.

Sütun içi kalıcı elle sıralama MVP'de yoktur; kartlar güncelleme zamanına göre listelenir. Silme yerine yönetici arşivi vardır (`POST /api/tasks/:id/archive`, güncel sürümle; görev penceresinde onaylı Arşivle düğmesi). Arşivlenen görev panodan, düzenlemeden ve detaydan kalkar; bekleyen teslimi geri çekilir. Arşivden çıkarma MVP'de yoktur. Açık arşivlenmiş işler rapor sayımlarından çıkar; tamamlanmış iş arşivlense de geçmiş çıktısı raporda kalır. İptal ayrı bir Kanban sütunu değildir.
