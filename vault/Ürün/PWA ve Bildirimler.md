---
tur: urun
alan: ui
guncelleme: 2026-10-15
ozet: "Kurulabilir PWA, Web Push görev bildirimleri, son tarih hatırlatması ve güvenlik sınırları."
---
# PWA ve Bildirimler

15 Ekim 2026 kullanıcı talebiyle MVP sonrası kapsam açıldı. Mevcut MVP'nin bildirim kapsamı değişmez; aşağıdaki fazlar sonraki geliştirmedir. İş durumu ve atamalar GitHub Issues/Project'te tutulur; bu not teknik kapsam ve kabul kriterlerinin kanonik kaynağıdır.

## Uygulama durumu

Dört fazın kodu tamamdır (15 Ekim 2026):

- **Kurulum:** manifest, simgeler, yalnız genel çevrimdışı sayfayı saklayan service worker, Profilim'de kurulum kartı. Genel Bakış'ta kurulmamış cihaza kurulum, kurulu cihaza bildirim açma önerisi çıkar; kapatılınca o tarayıcıda bir daha gösterilmez.
- **Cihaz ve tercih:** `push_subscriptions` oturuma bağlıdır; çıkış ve pasifleştirme aboneliği siler. Tercihler hesap düzeyindedir: genel aç/kapat, atama, inceleme, karar, hatırlatma.
- **Olaylar:** atama/sorumlu değişimi → yeni sorumlu; incelemeye gönderim → komite başkanları; onay, düzeltme isteği ve yeniden açma → sorumlu. SQLite outbox aynı transaction'da yazılır, gönderici 5 sn'de bir çalışır, gönderim anında yetki/tercih/oturum yeniden kontrol edilir.
- **Hatırlatma:** son tarihten 24 saat önce tek bildirim; 22:00–09:00 İstanbul arasına düşerse 09:00'a kayar. Tekillik anahtarı görev + son tarihtir: son tarih değişirse eski hatırlatma atlanır, yenisi planlanır. İncelemedeki/tamamlanan görev ve hatırlatma anından sonra açılan görev hatırlatılmaz.
- **Metin:** kilit ekranında yalnız tür yazar (“Sana yeni bir görev atandı.”, “İncelemeni bekleyen bir teslim var.”, “Görevin onaylandı.”, “Görevin düzeltme için sana geri döndü.”, “Bir görevinin son tarihi yaklaşıyor.”). Service worker bu sabit listeden başka metni genel cümleyle değiştirir; tıklama yalnız uygulama içi görev adresini açar.
- **Anahtar:** `PUSH_ENABLED=true` + `VAPID_SUBJECT` ile iki anahtar boş bırakılırsa sunucu ilk açılışta bir çift üretip `app_settings` tablosunda saklar; özel anahtar sunucudan çıkmaz ve yedeklerle birlikte korunur. Anahtar değişirse bütün cihazlar bildirimi yeniden açmalıdır.

Canlı adres `https://manage.gdgostimtech.com` (VeriTeknik `video-sunucu`, nginx + Let's Encrypt, `/opt/gdg-manage` Compose kurulumu). Otomatik testler Chromium'da tarayıcı API'lerini taklit eder; gerçek iPhone/Android teslimi canlıda ayrıca denenmelidir.

## Faz 1 — Hızlı kurulabilir uygulama

- Manifest: kalıcı `id`, aynı origin kapsamı, `/` başlangıcı, `standalone`, Türkçe ad ve ikonlar. Mevcut marka kullanılır; yeni görsel üretimi yoktur. Simgeler `node scripts/pwa-icons.mjs` ile mevcut Playwright bağımlılığından tekrar üretilir.
- Service worker yalnız `/offline.html` dosyasını Cache Storage'a koyar. API, oturum, e-posta, görev, rapor, şifre token'ı veya kişiselleştirilmiş HTML saklamaz. API ve yazma isteklerini yakalamaz. Navigasyon önce ağa gider; yalnız ağ hatasında genel çevrimdışı ekran açılır.
- Yeni worker, eski sekmeler kapanana kadar bekler. Formları yenileten `skipWaiting` veya otomatik reload yoktur. `offline.html` değiştiğinde `sw.js` içindeki cache sürümü de artırılır. Yalnız `gdg-offline-` önekli eski önbellekler temizlenir.
- Üretim HTTPS olmalı; yerel localhost test istisnasıdır. `sw.js`, manifest ve giriş HTML'i reverse proxy tarafından uzun süreli/immutable cache'lenmemelidir. Express'in mevcut `max-age=0` varsayılanı yeniden doğrulama sağlar.

Kabul: manifest ve ikon boyutları doğrulanır; worker etkinleşir; bağlantı kesilince Türkçe ekran açılır; geri gelince yeniden deneme çalışır; API çevrimdışı cevap üretmez; cache yalnız genel offline sayfadır. 375 px'de taşma yoktur. Canlı çıkışta Android/Chrome, iPhone/Safari ana ekran ve masaüstü Chrome/Edge üzerinde gerçek kurulum ayrıca denenir. Otomatik Chromium testi gerçek iOS kurulumunun yerine geçmez.

## Faz 2 — Cihaz aboneliği ve kullanıcı tercihleri

Bağımlılık: Faz 1'in HTTPS ortamında doğrulanması. İlk PR veritabanı/korumalı API; ikinci PR Profilim ayarları ve cihaz denemesi.

- SQLite migration: `push_subscriptions` (user_id, benzersiz endpoint, p256dh, auth, created_at, last_seen_at) ve `notification_preferences` (user_id, enabled, assignment, review, decision, reminder). Bir kullanıcının birden fazla cihazı olabilir. Endpoint/anahtarlar secret kabul edilir, loglanmaz.
- `/api/me/push-subscriptions` POST/DELETE ve `/api/me/notification-preferences` GET/PATCH: mevcut oturum ve origin kontrolü; sahiplik sunucudaki kullanıcıdan alınır. Client'ın gönderdiği user_id kabul edilmez. Şema, uzunluk ve hız sınırları uygulanır.
- VAPID özel anahtarı yalnız sunucu secret'ı; açık anahtar istemciye verilir. Yapılandırma yoksa ayar kartı doğru durum gösterir, etkinleştirme düğmesi sunulmaz. VAPID anahtarı her restart'ta yeniden üretilmez.
- “Bu cihazda bildirimleri aç” tıklaması üzerine izin ve `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. Destek yok, henüz sorulmadı, reddedildi, izinli ama abonelik yok ve etkin durumları ayrı gösterilir. Reddedilmiş izin tekrar tekrar istenmez; tarayıcı ayarı açıklanır.
- iOS/iPadOS 16.4+ için ana ekrana eklenmiş web uygulaması ve doğrudan kullanıcı etkileşimi gerekir. Tarayıcı adından çok özellik desteği kontrol edilir. Kurulum otomatik bildirim izni anlamına gelmez.
- Çıkışta bu cihaz aboneliği çözülür; aynı cihazda farklı hesaba geçiş eski kullanıcıya ait bildirim sızdırmaz. Hesap pasifleştirme bütün abonelikleri kapatır. Abonelik yenileme uygulama açılışında sunucuyla uzlaştırılır; yalnız `pushsubscriptionchange` desteğine güvenilmez.

Kabul: izin reddi/iptali uygulamayı bozmaz; çoklu cihaz ve hesap değiştirme denenir; başka kullanıcının aboneliği okunamaz/silinemez; test bildirimi yalnız kendi cihazına gönderilir; gerçek iOS/Android cihazında doğrulanır.

## Faz 3 — Görev olaylarından güvenilir bildirim

Bağımlılık: Faz 2. Yeni harici kuyruk servisi gerektirmeyen SQLite outbox ve mevcut tek sunucuda arka plan gönderici yeterlidir. Web Push kütüphanesi uygulama sırasında Context7 ile seçilir; bugün bağımlılık eklenmez.

| Olay | Önerilen alıcı |
| --- | --- |
| Görev atandı / sorumlu değişti | Yeni sorumlu |
| İncelemeye gönderildi | İlgili komitenin başkanları |
| Onaylandı / düzeltme istendi / yeniden açıldı | Görev sorumlusu |

- Olayı yapan kendisine bildirim almaz. Komite dışındaki kişiler, pasif hesaplar ve tercihi kapalı kullanıcılar dışlanır; gönderim anında yetki yeniden kontrol edilir. Genel başkana tüm olayları göndermek varsayılan değildir.
- İşlem ve outbox kaydı aynı DB transaction'ında yazılır; ağ gönderimi transaction dışında yapılır. `(event_id, user_id, subscription_id)` tekilliği, sınırlı exponential backoff ve maksimum deneme sayısı olur. Restart bekleyen işleri korur; eşzamanlı göndericinin aynı işi sahiplenmesi engellenir.
- 404/410 abonelik silinir; 429/5xx sınırlı yeniden denenir; kimlik/config hatası operasyona görünür. Abonelik endpoint'leri üzerinden SSRF engellenir: HTTPS, doğrulanmış push sağlayıcısı, özel ağlara erişim ve redirect yasağı.
- Kilit ekranı varsayılanı genel metindir (“Görevinde bir güncelleme var”); e-posta, yorum veya ret gerekçesi taşınmaz. `notificationclick` yalnız aynı origin'de görev bağlantısını açar. Göreve doğrudan açılan route henüz yoktur; bu fazda `/panolar?komite=…&gorev=…` eklenir ve oturum/komite yetkisi yeniden doğrulanır.

Kabul: görev işlemi push sağlayıcısı kapalıyken de başarılıdır; doğru alıcı ve tercih uygulanır; yeniden deneme tekrar bildirim üretmez; 410 temizliği, restart, yetki kaybı, logout ve giriş sonrası hedefe dönüş test edilir. Push en iyi çaba ile teslim edilir; uygulamadaki görev durumu asıl kaynaktır.

## Faz 4 — Hatırlatmalar ve canlı operasyon

- Son tarihten 24 saat önce tek hatırlatma; İstanbul saati ve kullanıcı tercihi. Tamamlanan/arşivlenen görev atlanır. Son tarih değişince eski plan iptal edilir. Tekillik anahtarı görev + kullanıcı + son tarih + hatırlatma türüdür.
- Bildirim sayısı, başarılı/başarısız gönderim ve kuyruk yaşı kişisel veri içermeyen metriklerle izlenir. Eski tamamlanmış outbox kayıtları için saklama süresi belirlenir.
- Önce küçük test grubu, sonra topluluk. Gönderimi durduran sunucu ayarı, önceki imaja geri dönüş, migration öncesi yedek ve secret saklama kontrolü yapılır. Başarı ölçütü gerçek cihazdaki teslim/izin/çıkış akışıdır; yalnız build başarısı yeterli değildir.

Önerilen uygulama sırası: Faz 1'i yayınla → Faz 2 ile test cihazını bağla → Faz 3'te önce atama, sonra inceleme/karar olayları → Faz 4 hatırlatmalar. Her faz bağımsız doğrulanıp dağıtılabilir; sunucu bilgisi gelmeden canlı teslim tarihi taahhüt edilmez.

## Teknik kaynaklar

15 Ekim 2026 tarihinde Context7 üzerinden MDN ve Playwright belgeleri, ayrıca WebKit'in birincil açıklaması kontrol edildi.

- [MDN: Kurulabilir PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN: Service worker yaşam döngüsü](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN: Push aboneliği](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- [WebKit: iOS/iPadOS ana ekran Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
