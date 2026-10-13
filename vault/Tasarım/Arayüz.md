---
tur: tasarim
alan: ui
guncelleme: 2026-10-13
ozet: "Referanslara dayalı minimal dashboard dili ve Google renk vurguları."
---
# Arayüz

## Uygulama durumu
Responsive dashboard iskeleti hazırdır. Masaüstünde 256px sabit sidebar; mobilde açılır menü kullanılır. Genel Bakış, Panolar, Profilim ve role göre Raporlar; başkanda Komiteler ile Kullanıcılar bağlantıları görünür. Hesap menüsü sidebar altındadır. Genel Bakış rapor API'sinden gelen dört görev sayacını, kişinin yaklaşan açık işlerini ve komite listesini gösterir; veri yokken maskotlu boş durum kullanılır.

Bileşenler shadcn/ui'nun açık kod ve composition yaklaşımıyla repo içinde tutulur; ürünün mevcut CSS tokenlarına göre sadeleştirilir. Lucide tek ikon setidir. Klavye focus halkaları, semantik başlıklar, `aria-current`, Escape ile mobil menü kapatma ve reduced-motion davranışı uygulanmıştır. Veri bağlı olmayan ekranlar açık bir hazırlık durumu gösterir; sahte metrik üretilmez.

Kullanıcı yönü: kurumsal, standart, sade dashboard. Büyük gradient, cam efekti, aşırı gölge, dekoratif hero, başlığın üstünde ekstra üst başlık ve yapay pazarlama metni yok. Tek net sayfa başlığı ve yanında ilgili işlem yeterli.

## Referanslardan alınanlar
- Dashboard 01: sabit açık sidebar, açık gri çalışma zemini, beyaz kartlar, ince çizgiler, düzenli boşluk ve net veri hiyerarşisi.
- Dashboard 02: kompakt özet kartları, anlaşılır tablo/grafik alanları.
- Finans alanları, ücretli plan kartları, arka plan manzarası, dekoratif widget kalabalığı ve bildirim zili ürüne taşınmaz.
- Görseller tasarım referansıdır; uygulamanın ekran görüntüsü veya yeniden kullanılacak UI asset'i değildir.

## Görsel dil
Beyaz yüzey, açık nötr gri zemin, koyu gri metin; 1px sınır, ölçülü 8–12px radius. Sistem sans-serif başlangıç için yeterli. Google renkleri küçük vurgu alanlarında: mavi #4285F4, kırmızı #EA4335, sarı #FBBC05, yeşil #34A853. Bu renkler marka ilhamıdır; küçük metinde yeterli kontrast sağlayan koyu tonlar kullanılır. Durum yalnız renkle anlatılmaz.

shadcn/ui bileşenleri sadeleştirilir. İkonlar Lucide çizgi setinden; UI ikonu için raster üretim yapılmaz. Light tema MVP; dark tema eklenmez. Kullanıcı ilk çalışan ekranlar üzerinden tasarımı revize edecek.

## Düzen
Sol: GDG OSTİM/Management Tool, Genel Bakış, Panolar, Profilim; yetkili kişilerde Raporlar; başkanda Komiteler ve Kullanıcılar. Alt bölümde küçük maskot/yardım ve hesap menüsü.
Üst: tek başlık, gerekiyorsa komite seçimi ve eylem. Bildirim veya anlamsız arama kutusu yok.
Mobil: kapanan sidebar, board yatay kaydırma veya sütun seçimi; görev durumu menüyle değişir. Maskot görevlerin ve düğmelerin önünü kapatmaz.

## Durumlar
Loading/skeleton, boş komite, görev yok, yetkisiz, oturum süresi doldu, kaydetme hatası, ağ hatası, çakışma ve arşivlenmiş komite durumları tasarlanır. Toast yalnız kullanıcının yaptığı işin sonucudur; bildirim merkezi değildir.

[[Tasarım/Ekranlar]], [[Tasarım/Maskot ve Varlıklar]].
