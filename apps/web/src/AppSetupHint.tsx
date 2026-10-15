import { useEffect, useState } from 'react';
import { BellRing, Smartphone, X } from 'lucide-react';
import { useInstallation } from './pwa';
import { supportsPush, syncPushDevice } from './notifications';
import { Button } from './ui';

const DISMISSED = 'gdg-setup-hint-dismissed';
const readDismissed = () => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } };

/** A quiet nudge on the overview: install first, then turn on notifications. Settings stay on Profilim. */
export function AppSetupHint() {
  const { state, install } = useInstallation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [pushReady, setPushReady] = useState<boolean | null>(null);
  useEffect(() => {
    if (dismissed) return;
    let live = true;
    syncPushDevice().then(({ settings, subscribed }) => {
      if (!live) return;
      const blocked = !supportsPush() || Notification.permission === 'denied';
      setPushReady(!settings.configured || blocked || (subscribed && settings.preferences.enabled));
    }, () => { if (live) setPushReady(true); });
    return () => { live = false; };
  }, [dismissed]);
  if (dismissed || pushReady === null || (state === 'installed' && pushReady)) return null;
  const close = () => { try { localStorage.setItem(DISMISSED, '1'); } catch { /* Still hide for this visit. */ } setDismissed(true); };
  const installStep = state !== 'installed';
  return <aside className="setup-hint" aria-label="Uygulama önerisi">
    <span className="setup-hint-icon" aria-hidden="true">{installStep ? <Smartphone size={20} /> : <BellRing size={20} />}</span>
    <div>
      <strong>{installStep ? 'GDG OSTİM’i telefonuna ekle' : 'Görev bildirimlerini aç'}</strong>
      <p>{installStep ? 'Ana ekrandan uygulama gibi aç; görev atamaları ve incelemeler için bildirim al.' : 'Sana görev atandığında, incelemen beklendiğinde veya son tarih yaklaştığında bu cihaza haber verelim.'}</p>
    </div>
    <span className="setup-hint-actions">
      {installStep && state === 'available'
        ? <Button variant="primary" onClick={() => void install().catch(() => location.assign('/profilim'))}>Uygulamayı yükle</Button>
        : <Button variant="primary" onClick={() => location.assign('/profilim')}>{installStep ? 'Nasıl eklenir?' : 'Bildirimleri aç'}</Button>}
      <Button size="icon" variant="ghost" aria-label="Öneriyi kapat" onClick={close}><X size={18} /></Button>
    </span>
  </aside>;
}
