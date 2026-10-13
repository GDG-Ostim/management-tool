---
tur: mimari
alan: auth
guncelleme: 2026-10-13
ozet: "İlk başkan, kapalı kayıt, kullanıcı daveti ve Resend şifre akışı."
---
# Kimlik ve Kurulum

## İlk başkan
Önerilen uygulama: yalnız sunucuda çalışan idempotent bootstrap komutu. `BOOTSTRAP_ADMIN_EMAIL` ve `BOOTSTRAP_ADMIN_NAME` ortam değişkenidir. Başlangıç şifresi `BOOTSTRAP_ADMIN_PASSWORD_FILE` ile Docker secret dosyasından okunur; repoya veya loglara yazılmaz. E-posta/name secret sayılmaz; şifre kalıcı .env içinde tutulmaz.

Boş kurulumda migration → bootstrap → servis başlangıcı sırası. Bootstrap tamamlandı işareti DB'de korunur. Restart mevcut hesabın şifresini değiştirmez ve yeni yönetici yaratmaz. İlk işlemden sonra secret mount kaldırılabilir. Başlangıç şifresi güçlü, tek kurulumluk; ilk girişten sonra hesap ayarından değiştirilir. Herkese açık “ilk kullanıcı admin olur” endpoint'i yoktur.

Better Auth admin server API, güçlü rastgele veya bootstrap şifresiyle credential hesabı oluşturur. Şifre hashing kütüphaneye bırakılır. Admin plugin'in doğrudan HTTP uçları denetlenir; global admin rolü yalnız Başkan'dadır; gereksiz impersonation/yönetim uçları dışarı açılmaz.

## Davet
1. Başkan Kullanıcılar ekranında ad, e-posta, komiteler ve roller girer.
2. Sunucu kimlik ve yetkiyi doğrular; kullanıcı/credential oluşturur. Davet edilen kişiye rastgele başlangıç şifresi açıklanmaz.
3. Better Auth şifre sıfırlama altyapısı üzerinden tek kullanımlık, süreli şifre belirleme bağlantısı oluşturulur; Resend gönderir.
4. Kullanıcı bağlantıda şifresini belirler; uygulama profili etkin/davet kabul edildi olur; giriş yapar.
5. Başarısız gönderimde kullanıcı silinmez. Başkan gönderim hatasını görür ve aynı kullanıcıya yeniden davet gönderebilir; mükerrer hesap açılmaz.

Davet ve şifre sıfırlama bağlantısı için başlangıç tercihi 1 saatlik ortak süredir; süresi dolan daveti başkan yeniden gönderir. Ayrı özel token sistemi yazılmaz. Davetli hesap ilk şifre belirlemeden uygulama API'lerine giremez. Süresi dolan/kullanılmış bağlantı açık Türkçe hata gösterir.

## Auth ayarları
E-posta/şifre açık; `disableSignUp: true`. Signup yalnız arayüzden değil API'den de kapalı. React istemcisi Better Auth session hook'larını kullanır; auth token localStorage'a konulmaz.
Güvenli cookie, HTTPS, trustedOrigins, rate limit ve sabit uygulama origin'i. Şifre sıfırlama adresi allowlist ile sınırlandırılır; kullanıcıdan gelen rastgele redirect'e güvenilmez. Şifremi unuttum cevabı hesap varlığını sızdırmaz.
Kullanıcı pasifleştirme/şifre değişikliği uygun oturumları iptal eder. App tarafında aktiflik her istekte kontrol edilir.

## Resend
`RESEND_API_KEY`, `MAIL_FROM`, `BETTER_AUTH_SECRET`, `APP_URL`, `DATABASE_PATH` sunucu config'idir. Gerçek kullanıcılara e-posta için doğrulanmış sender domain gerekir; bu kurulumun uygulama issue'sunda yapılır. Bu planlama oturumunda gerçek mail gönderilmez.
Gönderim hatası yakalanır ve yöneticiye durum döner; reset tokenı/parola loglanmaz. Yerel testlerde sahte mail adapter'ı kullanılır.

Kaynaklar: [[Sistem/Teknik Kaynaklar]].
