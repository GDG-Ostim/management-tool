import { useState } from 'react';
import { Button, Card } from './ui';
import { useInstallation } from './pwa';

export function InstallCard() {
  const { state, install } = useInstallation();
  const [error, setError] = useState(false);
  return <Card className="install-card">
    <header><h2>Uygulamayı cihazına ekle</h2><p>GDG OSTİM’i ana ekranından ayrı bir pencere olarak aç.</p></header>
    {state === 'installed' ? <p role="status">Uygulama bu cihazda kurulu.</p>
      : state === 'available' ? <Button variant="primary" onClick={() => { setError(false); void install().catch(() => setError(true)); }}>Uygulamayı yükle</Button>
      : <p>iPhone veya iPad’de Safari’nin Paylaş menüsünden “Ana Ekrana Ekle”yi seç. Android’de tarayıcı menüsündeki “Uygulamayı yükle” veya “Ana ekrana ekle” seçeneğini kullan. Bilgisayarda destekleyen tarayıcıların adres çubuğundaki yükleme simgesini kullanabilirsin.</p>}
    {error && <p className="form-error" role="alert">Kurulum açılamadı. Tarayıcı menüsünden yeniden dene.</p>}
    <small>Güncel görev verileri ve işlem yapmak için internet bağlantısı gerekir.</small>
  </Card>;
}
