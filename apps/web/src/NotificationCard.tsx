import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api, errorMessage } from './api';
import { applicationKey, pushRegistration, supportsPush, syncPushDevice, type NotificationPreferences, type NotificationSettings } from './notifications';
import { Button, Card } from './ui';

export function NotificationCard() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => supportsPush() ? Notification.permission : 'default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function refresh() {
    setError(null);
    try {
      const state = await syncPushDevice(); setSettings(state.settings); setSubscribed(state.subscribed);
      if (supportsPush()) setPermission(Notification.permission);
    } catch (reason) { setError(errorMessage(reason, 'Bildirim ayarları yüklenemedi.')); }
  }
  useEffect(() => { void refresh(); const focus = () => { void refresh(); }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, []);
  async function save(change: Partial<NotificationPreferences>) {
    const previous = settings?.preferences;
    setSettings(value => value ? { ...value, preferences: { ...value.preferences, ...change } } : value);
    try {
      const preferences = await api<NotificationPreferences>('/api/me/notification-preferences', { method: 'PATCH', body: JSON.stringify(change) });
      setSettings(value => value ? { ...value, preferences } : value);
    } catch (reason) {
      if (previous) setSettings(value => value ? { ...value, preferences: previous } : value);
      throw reason;
    }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (reason) { setError(errorMessage(reason, 'Bildirim ayarı değiştirilemedi.')); }
    finally { setBusy(false); }
  }
  async function enable() {
    // Invoke the permission API directly in the click handler, before any network request.
    const allowed = await Notification.requestPermission(); setPermission(allowed);
    if (allowed !== 'granted') { setNotice(allowed === 'denied' ? 'Bildirim izni verilmedi. Tarayıcının site ayarlarından değiştirebilirsin.' : 'İzin isteği kapatıldı. İstersen daha sonra yeniden deneyebilirsin.'); return; }
    const registration = await pushRegistration();
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: applicationKey(settings!.publicKey!),
    });
    await api('/api/me/push-subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
    setSubscribed(true);
    await save({ enabled: true }); setNotice('Bu cihazda bildirimler açıldı.');
  }
  async function disableDevice() {
    const registration = await pushRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      // Remove server delivery first; browser permission need not be revoked to stop this device.
      await api('/api/me/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    }
    for (const item of await registration.getNotifications()) item.close();
    setSubscribed(false); setNotice('Bu cihazda bildirimler kapatıldı.');
  }
  const active = subscribed && settings?.preferences.enabled && permission === 'granted' && settings?.configured;
  return <Card className="notification-card">
    <header><h2><Bell size={18} />Bildirimler</h2><p>Görev atamaları ve inceleme sonuçları için cihaz bildirimlerini yönet.</p></header>
    {!settings ? <p>{error ? 'Ayarlar yüklenemedi.' : 'Ayarlar yükleniyor…'}</p> : <>
      {!settings.configured ? <p className="form-note">Bildirimler sunucuda henüz etkinleştirilmedi. Etkinleştirildiğinde buradan izin verebilirsin.</p>
        : !supportsPush() ? <p className="form-note">Bu tarayıcıda bildirim desteği yok. iPhone veya iPad kullanıyorsan uygulamayı ana ekrana ekleyip oradan aç.</p>
        : permission === 'denied' ? <p className="form-note">Bildirim izni engellenmiş. Açmak için tarayıcının site ayarlarından bildirimlere izin ver.</p>
        : <p role="status">{active ? 'Bu cihazda bildirimler açık.' : subscribed ? 'Bu cihaz bağlı; hesap bildirimleri kapalı.' : 'Bu cihazda bildirimler kapalı.'}</p>}
      <div className="notification-actions">
        {settings.configured && supportsPush() && permission !== 'denied' && !active && <Button variant="primary" disabled={busy} onClick={() => void run(enable)}>Bu cihazda bildirimleri aç</Button>}
        {subscribed && supportsPush() && <Button disabled={busy} onClick={() => void run(disableDevice)}>Bu cihazda kapat</Button>}
        {active && <Button disabled={busy} onClick={() => void run(async () => {
          const subscription = await (await pushRegistration()).pushManager.getSubscription();
          if (!subscription) throw new Error('Cihaz aboneliği bulunamadı. Yeniden etkinleştir.');
          await api('/api/me/notifications/test', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
          setNotice('Test bildirimi gönderim kuyruğuna eklendi.');
        })}>Test bildirimi gönder</Button>}
      </div>
      <fieldset disabled={busy || !settings.configured}>
        <legend>Hesabındaki tüm cihazlar</legend>
        {([['enabled', 'Bildirimleri al'], ['assignment', 'Bana görev atandığında'], ['review', 'Yönettiğim komitede inceleme beklendiğinde'], ['decision', 'Görevim onaylandığında, düzeltme istendiğinde veya yeniden açıldığında']] as const).map(([key, label]) =>
          <label key={key}><input type="checkbox" checked={settings.preferences[key]} onChange={event => void run(() => save({ [key]: event.target.checked }))} />{label}</label>)}
      </fieldset>
      <small>Bildirim içeriğinde kişi, görev başlığı veya yorum gösterilmez. Çıkış yaptığında bu cihazın bağlantısı kesilir.</small>
    </>}
    {error && <p className="form-error" role="alert">{error} <button type="button" onClick={() => void refresh()} disabled={busy}>Yeniden dene</button></p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </Card>;
}
