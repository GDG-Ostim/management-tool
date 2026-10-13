---
tur: tasarim
alan: assets
guncelleme: 2026-10-13
ozet: "Maskot referansları ve yalnız Poyraz'a ait Higgsfield üretim işi."
---
# Maskot ve Varlıklar

Sorumlu: **poyrazavsever**. Görsel üretimi gerektiren tüm issue'lar Poyraz'a atanır.

## Sağlanan karakter
Kırmızı/bordo gövdeli, iri amber gözlü, kıvırcık yeleli küçük ejderha. Altın/bej boynuz ve karın, mekanik/dişli karın deseni, küçük kanatlar, kulak yanında mavi-kırmızı detaylar ve uçlu kuyruk. Ön/yan/arka referans birlikte kimlik kaynağıdır. Yeni bir maskot tasarlanmaz.

![[Tasarım/Referanslar/maskot-on.png]]
![[Tasarım/Referanslar/maskot-yan.png]]
![[Tasarım/Referanslar/maskot-arka.png]]

## Tek üretim paketi
- Şeffaf arka planlı karşılama/işaret etme pozu: tanıtım. **Hazır.**
- Küçük sakin idle pozu: sidebar yardım alanı. **Hazır.**
- Hafif kutlama pozu: görev onayı sonrası kısa geri bildirim. **Hazır.**
- Basit boş durum pozu: henüz görev yok. **Hazır.**

Onaylı dosyalar `apps/web/public/mascot/` içindedir. Brief, prompt ve kalite kaydı: [[Tasarım/Varlıklar/Maskot Pozları]]. Tanıtım, sidebar yardım alanı ve boş görev durumu entegrasyonu #16 ile yapıldı; kutlama pozu tanıtımın son adımında kullanılır, onay geri bildirimi inceleme akışıyla bağlanır.

MVP'de seslendirme, video ve sürekli büyük animasyon şart değil. Gerekirse mevcut pozlara CSS ile küçük hareket verilir; reduced-motion desteklenir. Ekran kontrastı ve çalışma alanı karakterden önce gelir.

## Üretim ve kayıt
Higgsfield CLI ve companion skills hazır. Üretim sırasında güncel model/parametreler CLI'den doğrulanır; bu plan belirli model sürümüne bağımlı değildir.
Her final için kısa brief, kullanılan prompt, kaynak referansları, yerel final dosyası ve kontrol notu `vault/Tasarım/Varlıklar/` altında tutulur. Onaylı kopya `apps/web/public/mascot/` içine alınır. Public notlara hesap bilgisi, kredi bakiyesi, API anahtarı veya özel indirme linki konulmaz.

Kontrol: karakter tutarlılığı, alpha kenarları, 48–96px görünürlük, gereksiz gölge/zemin, responsive yerleşim. Kullanıcının verdiği orijinal dosyalar değiştirilmez. Referanstaki köşe işareti uygulama UI'si için ayrı asset olarak kullanılmaz.

Dashboard referansları:
![[Tasarım/Referanslar/dashboard-01.png]]
![[Tasarım/Referanslar/dashboard-02.png]]
