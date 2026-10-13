---
tur: urun
alan: urun
guncelleme: 2026-10-13
ozet: "İlk sürümün tamamlanma sınırı ve kapsam dışı özellikleri."
---
# MVP Kapsamı

## Yapılacak
- Tek GDG topluluğu; başkan (super admin), komite başkanı, üye.
- Çoklu komite üyeliği; her komitede ayrı rol.
- Güvenli ilk başkan oluşturma; kullanıcı ekleme ve Resend ile şifre belirleme.
- Komite ve üyelik yönetimi; başkan için kullanıcılar sayfası.
- Komite başına dört sütunlu Kanban, başkanlık için ortak görünüm.
- Görev açma/düzenleme, atama, deadline, öncelik, etiket, kontrol listesi, çıktı bağlantısı ve yorumlar.
- İnceleme, onay, ret ve yeniden açma; yalnız bu akışın gerekli olay kayıtları.
- Kişinin kendi profili/raporu; komite başkanının komite kapsamındaki üye raporları; başkanın tüm raporları.
- Minimal Türkçe responsive dashboard; maskotlu atlanabilir tanıtım ve küçük maskot alanı.
- Docker Compose ile tek sunucuda çalıştırma, kalıcı SQLite, basit yedek/geri yükleme.
- Yetki, rapor hesabı ve kritik kullanıcı akışlarının testleri.

## Kapsam dışı
Çok kiracılık, topluluk kaydı, herkese açık üye kaydı, OAuth, özel self-host onboarding, mobil uygulama, İngilizce, timeline/Gantt, bildirim merkezi, görev e-postaları, kişi etiketleme, dosya yükleme, genel audit/hareket ekranı, sohbet, puan/lig, yapay zekâ sohbeti, gerçek zamanlı ortak düzenleme, özel workflow/sütun editörü, takvim ve lansman planlaması.

Resend yalnız hesap kurulumu ve şifre sıfırlamada kullanılır; bildirim özelliği değildir.

## Uygulama varsayımları
Hızlı geliştirme için seçilen ve kullanıcı tarafından ayrıca tek tek belirtilmemiş ayrıntılar: tek sorumlu, tek komite/görev, zorunlu başlık ve sorumlu; deadline dahil diğer alanlar opsiyonel. İncelemedeki görevin teslim anı zamanında bitirmeyi belirler. Varsayımlar ilgili kanonik notta açıklanmıştır; kullanıcı revizyonuyla değiştirilebilir.

## Bitmiş ürün
Beş fazın 20 issue'su kapandığında, başkanın kullanıcı davetinden üyenin teslimine ve başkan onayının rapora yansımasına kadar akış çalışır. Bu zinciri bozan entegrasyon hataları son teslim issue'sunda çözülür; ek ürün özelliği açılmaz.
