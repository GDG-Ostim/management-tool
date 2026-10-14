---
tur: operasyon
alan: ops
guncelleme: 2026-10-13
ozet: "Docker, veri sürekliliği ve MVP kapanış akışı."
---
# Çalıştırma ve Teslim

Bu not uygulama issue'sunun planıdır; bugün çalışan Docker image veya uygulama yoktur.

## Tek sunucu
Çok aşamalı Docker build: React build + TypeScript API build → tek runtime. Native better-sqlite3 modülü runtime OS/Node ABI'siyle uyumlu üretilir. Tek replica; SQLite dosyası `/data` persistent volume'ünde. Reverse proxy HTTPS sağlar; yalnız uygulama portu iç ağda. Container root olmadan çalışır.

SQLite foreign_keys açık, WAL modu ve makul busy timeout. Küçük ekip için kısa senkron SQL transaction'ları kullanılır; transaction içinde ağ/e-posta beklenmez.

## Config
`.env.example` scaffold/deployment aşamasında gerçek sır içermeden yazılır: APP_URL, DATABASE_PATH, BETTER_AUTH_SECRET, RESEND_API_KEY, MAIL_FROM, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD_FILE.
İlk şifre dosyası Git dışındaki secrets dizininde; kurulum sonrası kaldırılır. Sabit demo parolası yok. Eksik zorunlu üretim config'inde servis net hata ile başlamaz.

## Başlatma ve veri
Sıralı idempotent migration → gerekiyorsa tek seferlik bootstrap → healthcheck. Yeniden başlatma kullanıcı/şifre/veriyi sıfırlamaz. Migration öncesi SQLite backup API'siyle yedek alınır; canlı WAL dosyasının yalnız ana .db dosyası kopyalanmaz. Basit CLI yedek komutu ve durdurulmuş servise geri yükleme adımları README'ye eklenir. Boş veritabanı ve mevcut veritabanı restart senaryoları test edilir.

## Son kontrol
Uygulama durumu: `npm run test:e2e` web uygulamasını derler, `e2e/server.ts` ile gerçek uygulamayı geçici veritabanı ve bellek içi e-posta adaptörüyle aynı origin'de açar ve `e2e/mvp.spec.ts` ile 1–5 ve 7. adımları tarayıcıda (Playwright/Chromium) uçtan uca yürütür: davet ve şifre belirleme, komite kurma, görev açma, ret gerekçesi, çıktı/yorum, onay, kişi/komite/genel rapor, başka komiteden 404/403, 375px genişlikte taşmasız sayfalar ve klavyeyle menü/görev penceresi. 6. adım ve kritik sunucu kuralları `npm test` ile `apps/api/test` altında doğrulanır: kapalı kayıt ve dışarı kapalı Better Auth yönetim uçları, tek kullanımlık ve süresi dolan şifre bağlantısı, pasif hesap, son başkan, komiteler arası 404/403 ve komite başına rol (`auth`, `permissions`), geçişler/ret/yeniden açma, eşzamanlı karar ve sürüm çakışması (`work`, `business-rules`), rapor örnekleri ve tekil sayım (`reports`), detay/arşiv kuralları ve migration/kısıtlar (`task-details`, `task-archive`, `database`). CI her PR'da bu akışı çalıştırır; hata olursa Playwright raporu artifact olarak yüklenir. Better Auth giriş hız sınırı IP başınadır (10 sn'de 3 giriş); test her kişiyi ayrı adresten girdirir. Üretimde reverse proxy `X-Forwarded-For` başlığını kendisi yazmalıdır; aksi hâlde istemci bu başlıkla sınırı aşabilir (#19).

1. Başkan giriş → komite oluştur → kullanıcı ekle → sahte/test mail adapter'ı ile şifre belirle.
2. Üye giriş → kendi işini aç → ilerlet → incelemeye gönder.
3. Komite başkanı reddet → üye düzeltip teslim et → başkan onayla.
4. Üye/komite/genel raporda tekil sayımlar ve gecikme kontrolü.
5. İkinci komite verisine yetkisiz erişim reddedilir; çok komiteli kullanıcının rolleri ayrıdır.
6. Yeniden açma, tekrar onay, eşzamanlı güncelleme, expired token ve pasif kullanıcı kontrolü.
7. Mobil/klavye kullanımı ve maskotun içeriği kapatmaması.
8. Docker restart, migration ve backup/restore duman testi.

Testlerin sahipleri [[Operasyon/GitHub İşleri]] içinde; tamamlanan işin kısa kanıtı PR/issue'ya yazılır. CI geçmesi tek başına canlı sunucuya dağıtım yapıldığı anlamına gelmez.
