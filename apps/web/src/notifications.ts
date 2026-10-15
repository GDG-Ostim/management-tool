import { api, ApiError } from './api';

export type NotificationPreferences = { enabled: boolean; assignment: boolean; review: boolean; decision: boolean; reminder: boolean };
export type NotificationSettings = { configured: boolean; publicKey: string | null; preferences: NotificationPreferences };
export const supportsPush = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushRegistration() {
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (registration?.active) return registration;
  throw new Error('Uygulama kurulumu henüz hazır değil. Sayfayı yenileyip yeniden dene.');
}

export function applicationKey(value: string) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

/** No permission prompts here; only reconcile an already-approved device with the current session. */
let synchronizing: Promise<{ settings: NotificationSettings; subscribed: boolean }> | null = null;
export function syncPushDevice() {
  if (synchronizing) return synchronizing;
  synchronizing = (async () => {
    const settings = await api<NotificationSettings>('/api/me/notifications');
    if (!supportsPush()) return { settings, subscribed: false };
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { settings, subscribed: false };
    if (Notification.permission !== 'granted') {
      await api('/api/me/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
      return { settings, subscribed: false };
    }
    if (!settings.configured) return { settings, subscribed: true };
    const currentKey = subscription.options.applicationServerKey;
    if (currentKey && settings.publicKey && !new Uint8Array(currentKey).every((byte, index) => byte === applicationKey(settings.publicKey!)[index])) {
      await api('/api/me/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
      return { settings, subscribed: false };
    }
    try {
      const result = await api<{ subscribed: boolean }>('/api/me/push-subscriptions', { method: 'POST', body: JSON.stringify({ ...subscription.toJSON(), renew: true }) });
      return { settings, subscribed: result.subscribed };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SUBSCRIPTION_OWNER') {
        await subscription.unsubscribe();
        return { settings, subscribed: false };
      }
      throw error;
    }
  })().finally(() => { synchronizing = null; });
  return synchronizing;
}

export async function clearBrowserPush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return;
  await (await registration.pushManager?.getSubscription())?.unsubscribe();
  for (const notification of await registration.getNotifications()) notification.close();
}
