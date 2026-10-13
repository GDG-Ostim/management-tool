---
tur: operasyon
alan: ops
guncelleme: 2026-10-13
ozet: "PR doğrulama, ana dal çıktısı ve Docker sonrası güvenli dağıtım planı."
---
# CI/CD

## Bugün çalışan CI
Her pull request ve `main` push'unda tek, tekrar üretilebilir doğrulama hattı çalışır:

1. Node.js 22 ve kilit dosyasıyla `npm ci`.
2. Vault bağlantı ve indeks kontrolü.
3. Tooling ve API entegrasyon testleri.
4. TypeScript kontrolü ile API ve web production build'i.
5. Production bağımlılıklarında yüksek/kritik npm güvenlik denetimi.

Yeni commit aynı branch'teki eski çalışmayı iptal eder. Süre sınırı takılan job'ların runner tüketmesini önler. `main` doğrulaması oluşan API/web derlemelerini 14 günlük GitHub artifact'i olarak saklar. Haftalık npm ve aylık GitHub Actions Dependabot PR'ları açılır.

`Vault` workflow'u yalnız doküman, bağlam scripti veya ortak çalışma kuralı değiştiğinde hızlı geri bildirim verir. Ana CI Vault'u ayrıca kontrol ettiği için merge güvenliği tek bir zorunlu `CI / Validate` durumuna bağlanabilir.

## Branch kuralı
CI ilk kez başarıyla çalıştıktan sonra `main` için pull request ve güncel `CI / Validate` kontrolü zorunlu kılınır. İki kişilik hızlı geliştirme akışında zorunlu onay sayısı sıfır tutulur; inceleme istenirse PR bazında yapılır. Force push ve branch silme kapalı tutulur.

## CD sınırı
Henüz production hedefi ve Docker image'ı yoktur; bu nedenle CI canlı ortama otomatik gönderim yapmaz. [[Operasyon/Çalıştırma ve Teslim]] ile #19 tamamlandığında ayrı CD hattı eklenir:

1. Sürüm etiketi immutable OCI image üretir; image commit SHA ve sürüm etiketi taşır.
2. Image taraması geçince digest ile GHCR'a yayınlanır.
3. GitHub `production` environment, secrets ve manuel onay ile seçilen sunucuya yalnız o digest dağıtılır.
4. Migration öncesi SQLite backup alınır; deploy sonrası healthcheck çalışır.
5. Healthcheck başarısızsa önceki image digest'ine dönülür; veri geri yükleme ayrı ve açık bir operatör işlemidir.

Deployment anahtarları repo veya artifact içine girmez. Resend ve Better Auth sırları yalnız environment secret olarak sağlanır. Canlı dağıtımın gerçek komutları, sunucu hedefi seçildiğinde #19 içinde yazılıp duman testiyle doğrulanır.
