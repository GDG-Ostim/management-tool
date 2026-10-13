---
tur: tasarim
alan: assets
guncelleme: 2026-10-13
ozet: "Higgsfield ile üretilen dört onaylı maskot pozunun brief ve kalite kaydı."
---
# Maskot Pozları

## Kaynak ve yöntem
Kimlik kaynağı olarak [[Tasarım/Referanslar/maskot-on.png]], [[Tasarım/Referanslar/maskot-yan.png]] ve [[Tasarım/Referanslar/maskot-arka.png]] birlikte kullanıldı. İlk onaylı karşılama çıktısı sonraki pozlarda dördüncü stil referansı oldu. Model: Higgsfield Nano Banana 2, kare 2K üretim. Düz beyaz zeminli üretimler Higgsfield Image Background Remover ile gerçek alfa kanallı PNG'ye çevrildi; web kopyaları yüksek kaliteli bicubic örneklemeyle 1024×1024 boyutuna indirildi.

Ortak prompt özeti: “Preserve the exact GDG OSTİM red dragon identity and proportions; crimson body, burgundy curly mane, tan antlers, blue-white-red cheek fins, small bat wings, one segmented flame-tip tail, gear-pattern beige belly and upper-right target emblem. Polished flat 2D kawaii mascot, crisp dark-red outlines, centered full character, flat white cutout background; no scenery, shadow, text, watermark, extra symbols, limbs or crop.”

## Final set

| Dosya | Brief ve poz promptu | Kullanım |
| --- | --- | --- |
| [welcome.png](../../../apps/web/public/mascot/welcome.png) | “Friendly welcome; one hand waving, warm confident smile.” | İlk giriş tanıtımı |
| [calm.png](../../../apps/web/public/mascot/calm.png) | “Calm helpful pose; one finger indicates a tip, other hand near belly.” | Sidebar yardım alanı |
| [celebrate.png](../../../apps/web/public/mascot/celebrate.png) | “Joyful celebration; both fists raised, closed-eye smile, wings slightly open.” | Görev onayı geri bildirimi |
| [empty.png](../../../apps/web/public/mascot/empty.png) | “Compact seated empty state; tail curled, both palms open, curious expression.” | Görev/komite boş durumu |

## Kalite kontrolü
- Dört final 1024×1024 `Format32bppArgb` PNG'dir; sol üst köşe alfa değeri `0` olarak doğrulandı.
- Yüz, yele, boynuz, yan yüzgeç renkleri, karın deseni, göğüs amblemi, kanatlar ve tek kuyruk korunur.
- Düz zemin, dama deseni ve cast shadow final dosyalarda bulunmaz.
- 48px ve 96px açık gri yüzey önizlemelerinde siluet ile ana ifade okunur; küçük kullanımda ince karın deseni bilgi taşımak için kullanılmaz.
- Orijinal üç referans değiştirilmedi. Hesap bilgileri ve geçici üretim bağlantıları kayda alınmadı.

Entegrasyon davranışı #16 kapsamında [[Tasarım/Ekranlar]] kurallarına göre yapılacak.
