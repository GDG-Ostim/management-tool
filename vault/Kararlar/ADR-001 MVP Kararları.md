---
tur: karar
alan: kararlar
guncelleme: 2026-10-13
ozet: "Kullanıcı tarafından netleştirilen kapsam ve uygulama tercihleri."
---
# ADR-001 MVP Kararları

Tarih: 2026-10-13. Kaynak: Poyraz'ın bu oturumdaki açık kararları.

## Kullanıcı kararları
Tek topluluk/kurulum; çoklu komite; üç yetki seviyesi; başkan yardımcısı başkanla aynı yetki. Bir kullanıcı farklı komitelerde farklı roller taşır. Başkan kullanıcıları oluşturur; e-posta ile şifre belirlenir. Üye bütün komite işlerini görür, yalnız kendi işini değiştirir ve kendine görev açar. Tamamlama yönetici onaylıdır.

Dört sabit sütun; başkan için ortak board. Görev detayları çoğunlukla opsiyoneldir. Yorum vardır; yükleme/mention/bildirim/genel hareket ekranı yok. Ret ve yeniden açma geçmişi vardır. Raporlar temel sayılar ve rol sınırlarıyla uygulanır.

React, Express, Better Auth, SQLite; Türkçe minimal dashboard; Google renk vurguları; gönderilen maskot ve dashboard referansları. Public Türkçe repo içi Obsidian vault. Codex ve Claude Code ortak çalışma düzeni. Poyraz/Türker eşit görev sayısı; görsel üretimi Poyraz'da. Public organizasyon Project'i ve kısa Türkçe issue'lar. Takvim, emek tahmini ve ayrıntılı issue kabul şablonu yok.

## Uygulama tercihleri
Tek sorumlu/tek komite görev modeli, onaylanan teslim zamanına göre gecikme, Docker secret üzerinden bootstrap şifresi, soft archive, version ile çakışma kontrolü, light tema ve statik poz + isteğe bağlı CSS hareket. Bunlar kullanıcı kapsamını uygulanabilir kılan başlangıç tercihleridir; kilitli kullanıcı tercihi olarak sunulmaz.

## Sonuç
Özel tenant yönetimi, generic platform ve fazladan altyapı yazılmaz. İnceleme geçmişi raporun veri ihtiyacıdır; ayrı audit ürünü kurulmaz. [[01 - MVP Kapsamı]] ve ilgili kanonik notlar ayrıntıyı taşır.
