---
tur: urun
alan: reports
guncelleme: 2026-10-13
ozet: "Tekil görev sayımı, teslim zamanı ve rol kapsamına göre temel raporlar."
---
# Raporlar

İlk sürümde tarih/dönem filtreleri, puanlama ve liderlik tablosu yoktur. Raporlar mevcut veri üzerinden kümülatif görünür. Kişisel profil ad, komiteler ve kapsam dahilindeki görev/çıktı listesini gösterir; üyelerin birbirinin performans sayfasını görmesi gerekmez.

## Sayımlar
- Tamamlanan: güncel durumu Tamamlandı olan farklı görev sayısı. Aynı işin iki kez tamamlanması iki iş sayılmaz.
- Zamanında biten: tamamlanan işin onaylanan son teslim zamanı, o teslimin deadline görüntüsünden küçük veya eşittir.
- Geç biten: tamamlanan işin onaylanan son teslim zamanı deadline görüntüsünden büyüktür.
- Açık geciken: tamamlanmamış, arşivlenmemiş ve deadline'ı geçmiş görev. İncelemede zamanında teslim edilmiş iş bu sayıya girmez; geç teslim edilmiş iş girer.
- Geciken toplam: geç biten + açık geciken.
- Deadline olmayan iş zamanında/geç sınıflarına girmez; tamamlanan sayısına girer. Ayrı küçük “Tarihsiz tamamlanan” sayısı eşitliği açıklar.
- İncelemede bekleyen ve açık görev sayısı küçük özet olarak gösterilir.

Saatler veritabanında UTC; kullanıcıya Europe/Istanbul ile gösterilir. Yalnız gün seçildiğinde deadline İstanbul saatiyle o günün 23:59:59.999 anıdır. Karşılaştırmalarda tek sunucu zamanı kullanılır.

## Örnekler
Deadline 15 Ekim 23:59, teslim 15 Ekim 20:00, onay 16 Ekim: zamanında.
Teslim 16 Ekim: geç.
Teslim 15 Ekim, ret, yeniden teslim 17 Ekim: son onaylanan teslim geç; ilk teslim bunu maskelemez.
Tamamlandıktan sonra yeniden açılan görev tamamlanan sayısından çıkar; eski onay geçmişte görünür. Yeniden tamamlanınca yine bir görev sayılır.

## Görünürlük ve gruplama
Üye yalnız kendi açık görevlerini ve kendisine ait tamamlanmış teslimleri görür. Komite başkanı yalnız başkanı olduğu komitelerdeki kayıtları; başkan tamamını görür. Kişisel tamamlanan iş, onaylanan teslimin sorumlu görüntüsüne; açık iş, güncel sorumluya yazılır. Yeniden atama eski geçmişi başka kişiye taşımaz.

Genel toplamda aynı kişi iki komitede olsa da aynı görev bir kez sayılır. Üye sayısı `distinct user_id`; görev sayısı `distinct task_id`. Pasif kullanıcıların eski tamamlanmış işleri korunur. Raporda komite, sorumlu, durum, deadline, son teslim/onay ve çıktı bağlantıları listelenir. Ret/yeniden açma sayıları görev detayı veya satır ayrıntısında görülebilir.

Hesaplar backend'de tek rapor servisinde yapılır; frontend ayrı formül üretmez.
