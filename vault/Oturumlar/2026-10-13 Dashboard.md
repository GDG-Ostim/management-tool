---
tur: oturum
alan: ui
guncelleme: 2026-10-13
ozet: "Poyraz #6 dashboard iskeletinin uygulama ve doğrulama kaydı."
---
# 2026-10-13 Dashboard

Poyraz'ın #6 işi için dashboard iskeleti kuruldu. Auth sonrası `/api/me` ile güncel rol ve profil okunur; başarısız veya süresi dolmuş oturum giriş ekranına döner. Başkan menüsü Genel Bakış, Panolar, Profilim, Raporlar, Komiteler ve Kullanıcılar alanlarını gösterir. Normal kullanıcıya başkan yönetim bağlantıları sunulmaz.

Referans tasarımlardan sabit açık sidebar, açık gri çalışma zemini, beyaz kartlar, ince sınırlar ve düzenli boşluk alındı. Dekoratif arama, bildirim, ücret kartı ve finans bileşenleri eklenmedi. Google renkleri sayaç çizgileri ve küçük durum yüzeyleriyle sınırlıdır. Bağlı veri henüz olmadığı için sayaçlar sıfır, listeler açıklayıcı boş durum gösterir.

Masaüstü düzeni yerel tarayıcıda ve erişilebilirlik ağacında kontrol edildi. Ana menü label'ı, aktif sayfa `aria-current`, başlık seviyeleri, düğme adları ve hesap menüsü okunuyor. Responsive CSS; 1080px altında tek kolon içerik, 760px altında Escape/overlay ile kapanan sidebar ve 460px altında tek kolon sayaçlar sağlar. `prefers-reduced-motion` ortak stilinden yararlanır.

Kanonik tasarım kararı: [[Tasarım/Arayüz]]. İş takibi: [[Operasyon/GitHub İşleri]].
