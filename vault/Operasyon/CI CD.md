---
tur: operasyon
alan: ops
guncelleme: 2026-10-15
ozet: "PR doğrulama, ana dal çıktısı ve Docker sonrası güvenli dağıtım planı."
---
# CI/CD

## Bugün çalışan CI
Her pull request ve `main` push'unda tek, tekrar üretilebilir doğrulama hattı çalışır:

1. Node.js 22 ve kilit dosyasıyla `npm ci`.
2. Vault bağlantı ve indeks kontrolü.
3. Tooling ve API entegrasyon testleri.
4. Playwright/Chromium ile uçtan uca akış (`npm run test:e2e`); hata olursa rapor artifact olarak yüklenir.
5. TypeScript kontrolü ile API ve web production build'i.
6. Production bağımlılıklarında yüksek/kritik npm güvenlik denetimi.

Ayrı `Docker smoke` job'u imajı derler, Compose ile başlatır; giriş, yeniden başlatmada veri sürekliliği, canlı yedek ve servis durdurularak geri yüklemeyi `scripts/docker-smoke.sh` ile dener.

Workflow action'ları Node.js 24 runtime kullanan güncel major sürümlerdedir. Uygulamanın test/build matrisi ise `package.json` ile uyumlu Node.js 22 üzerinde çalışır.

Yeni commit aynı branch'teki eski çalışmayı iptal eder. Süre sınırı takılan job'ların runner tüketmesini önler. `main` doğrulaması oluşan API/web derlemelerini 14 günlük GitHub artifact'i olarak saklar. Haftalık npm ve aylık GitHub Actions Dependabot PR'ları açılır.

`Vault` workflow'u yalnız doküman, bağlam scripti veya ortak çalışma kuralı değiştiğinde hızlı geri bildirim verir. Ana CI Vault'u ayrıca kontrol ettiği için merge güvenliği tek bir zorunlu `CI / Validate` durumuna bağlanabilir.

## Branch kuralı
CI ilk kez başarıyla çalıştıktan sonra `main` için pull request ve güncel `CI / Validate` kontrolü zorunlu kılınır. Tek geliştiricili akışta zorunlu onay sayısı sıfır tutulur; CI yeşil olan PR doğrudan merge edilir; inceleme istenirse PR bazında yapılır. Force push ve branch silme kapalı tutulur.

## CD sınırı
Kullanıcı 15 Ekim 2026 tarihinde uygulamanın yayında olduğunu bildirdi. Mevcut reponun CI hattında otomatik canlı dağıtım yoktur; canlı adres, sunucu ve mevcut dağıtım yöntemi bu oturumda doğrulanamadı. Kullanıcının son yönlendirmesi önce güncellemeyi tamamlamaktır. Bu revizyon için deploy henüz yapılmadı. Docker imajı ve Compose kurulumu hazırdır ([[Operasyon/Çalıştırma ve Teslim]]); hedef netleşince aşağıdaki CD planı mevcut hosting akışına uyarlanır:

1. Sürüm etiketi immutable OCI image üretir; image commit SHA ve sürüm etiketi taşır.
2. Image taraması geçince digest ile GHCR'a yayınlanır.
3. GitHub `production` environment, secrets ve manuel onay ile seçilen sunucuya yalnız o digest dağıtılır.
4. Migration öncesi SQLite backup alınır; deploy sonrası healthcheck çalışır.
5. Healthcheck başarısızsa önceki image digest'ine dönülür; veri geri yükleme ayrı ve açık bir operatör işlemidir.

Deployment anahtarları repo veya artifact içine girmez. Resend ve Better Auth sırları yalnız environment secret olarak sağlanır. Canlı dağıtımın gerçek komutları sunucu hedefi seçildiğinde yeni bir issue ile yazılır ve mevcut duman testiyle doğrulanır.
