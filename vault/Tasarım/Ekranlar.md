---
tur: tasarim
alan: ui
guncelleme: 2026-10-13
ozet: "MVP ekran listesi ve her ekranın işlevi."
---
# Ekranlar

| Ekran | İçerik |
| --- | --- |
| Giriş | E-posta, şifre, şifremi unuttum; kayıt bağlantısı yok |
| Şifre belirleme/sıfırlama | Şifre doğrulama, token süresi/kullanılmış bağlantı, girişe dönüş |
| Genel Bakış | Role uygun açık/incelemede/tamamlanan/geciken özet ve ilgili görev listesi |
| Panolar | Komite seçimi; dört sütun; başkanda Tüm komiteler; başlık/sorumlu/durum filtresi |
| Görev detay paneli | Alanlar, checklist, çıktı URL'leri, yorumlar, inceleme geçmişi, role uygun eylemler |
| Komiteler | Başkan için oluştur/düzenle, üye ve başkan atama, arşiv |
| Kullanıcılar | Başkan için ekle, üyelik/rol düzenle, davet yeniden gönder, pasifleştir |
| Profilim | Ad, komiteler, kendi görev/çıktı listesi ve temel sayaçlar; şifre değiştirme |
| Raporlar | Başkan için genel/komite/kişi; komite başkanı için kendi komiteleri ve üyeleri |
| Tanıtım | İlk girişte atlanabilir kısa maskot rehberi; sonradan tekrar açılabilir |

Rapor ekranları uygulama durumu: Profilim ad, e-posta, komite rozetleri, dört sayaç, durum filtreli görev tablosu ve şifre değiştirme (diğer oturumları kapatır) içerir. Raporlar ekranında kırılım tabloları bir alt rapora bağlanır; tablolar 900px altında etiketli kartlara döner. Hesap ve rapor kuralları [[Ürün/Raporlar]] içindedir.

Komiteler uygulama durumu: başkan komite oluşturur, açıklamasını görür, üye ekler, komite rolünü (komite başkanı/üye) değiştirir, açık görevi olmayan üyeyi çıkarır ve açık görevi olmayan komiteyi arşivler. Komite panelindeki Düzenle aynı pencereyle ad ve açıklamayı günceller; ad komiteler arasında büyük/küçük harften bağımsız tekildir ve boş bırakılamaz. Panolar uygulama durumu [[Ürün/Görev Akışı]] içindedir.

Kullanıcılar uygulama durumu: başkan tablo/kart listesinde kişi, rol, davet/aktiflik durumu ve eklenme tarihini görür; Tümü/Aktif/Davetli/Pasif filtresi ve ad/e-posta araması vardır. Kullanıcı ekleme diyaloğu daveti hemen gönderir; gönderim başarısızsa hesap korunur ve satır menüsünden yeniden denenir. Başkan yap/Üye yap ve pasifleştirme onay ister; sonuç kısa toast ile bildirilir. Kendi satırında işlem menüsü yoktur. Komite üyeliği Komiteler ekranından atanır. Başkan olmayan kullanıcı bu adreste yetkisiz durumu görür.

Üyeye diğer kişilerin rapor linki sunulmaz. Çok komiteli üyede board seçimi görünür; başkan olmadığı komitede yönetim eylemi görünmez.

Tanıtım adımları: panonu seç → görevi aç/ilerlet → incelemeye gönder → profilinden çıktını gör. Başkan rolünde kullanıcı ve komite yönetimi ayrıca kısa açıklanır. Tanıtım bitişi kullanıcı profilinde saklanır.

Uygulama durumu: tanıtım ilk girişte modal olarak açılır; Atla, Kapat, Escape veya son adım `PATCH /api/me/onboarding` ile bitişi kaydeder. Kayıt başarısızsa diyalog açık kalır ve hata gösterilir. Sidebar'daki küçük maskotlu yardım alanı tanıtımı tekrar açar; tekrar açmak durumu değiştirmez. Maskot geçişi ve hover hareketi küçük CSS animasyonudur; reduced-motion tercihinde kapanır. Boş görev durumu boş durum pozunu kullanır.

Her ekran Türkçedir. Başlığın üzerinde “workspace overview” gibi ek dekoratif satır yok. Referanslar [[Tasarım/Arayüz]] içindeki kurallarla yorumlanır.
