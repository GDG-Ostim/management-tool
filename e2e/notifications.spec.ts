import { expect, test } from '@playwright/test';
import { admin } from './accounts';

test('bildirim ekranı kullanıcı tıklamasıyla izin ister, tercihleri kaydeder ve cihazı kapatır', async ({ page }) => {
  const preferences = { enabled: false, assignment: true, review: true, decision: true };
  const publicKey = 'B' + 'A'.repeat(86); // Browser API is stubbed; no provider subscription or real notification is sent.
  let registered = false;
  let queued = false;
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    let subscription: PushSubscription | null = null;
    Object.assign(window, { permissionRequests: 0, allowPermission: false, setPushPermission: (value: NotificationPermission) => { permission = value; } });
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => {
      const state = window as unknown as { permissionRequests: number; allowPermission: boolean };
      state.permissionRequests++;
      permission = state.allowPermission ? 'granted' : 'default';
      return permission;
    };
    PushManager.prototype.getSubscription = async () => subscription;
    PushManager.prototype.subscribe = async () => {
      subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device', options: { userVisibleOnly: true, applicationServerKey: null },
        expirationTime: null, getKey: () => null,
        toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device', keys: { p256dh: 'test', auth: 'test' } }),
        unsubscribe: async () => { subscription = null; return true; },
      } as PushSubscription;
      return subscription;
    };
  });
  await page.route('**/api/me/notifications', route => route.fulfill({ json: { configured: true, publicKey, preferences } }));
  await page.route('**/api/me/notification-preferences', route => {
    Object.assign(preferences, route.request().postDataJSON()); return route.fulfill({ json: preferences });
  });
  await page.route('**/api/me/push-subscriptions', route => {
    registered = route.request().method() !== 'DELETE'; return route.fulfill({ json: { subscribed: registered } });
  });
  await page.route('**/api/me/notifications/test', route => { queued = true; return route.fulfill({ status: 202, json: { queued: true } }); });
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.0.0.90' });
  await page.goto('/giris?next=%2Fprofilim');
  await page.getByLabel('E-posta').fill(admin.email);
  await page.getByLabel('Şifre', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profilim', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: 'Atla', exact: true }).isVisible()) await page.getByRole('button', { name: 'Atla', exact: true }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByText('Bu cihazda bildirimler kapalı.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { permissionRequests: number }).permissionRequests)).toBe(0);
  await page.getByRole('button', { name: 'Bu cihazda bildirimleri aç', exact: true }).click();
  await expect(page.getByText('İzin isteği kapatıldı.', { exact: false })).toBeVisible();
  expect(registered).toBe(false);
  await page.evaluate(() => { (window as unknown as { allowPermission: boolean }).allowPermission = true; });
  await page.getByRole('button', { name: 'Bu cihazda bildirimleri aç', exact: true }).click();
  await expect(page.getByText('Bu cihazda bildirimler açık.', { exact: true })).toBeVisible();
  expect(registered).toBe(true); expect(preferences.enabled).toBe(true);
  await page.getByLabel('Bana görev atandığında', { exact: true }).uncheck();
  await expect(page.getByLabel('Bana görev atandığında', { exact: true })).not.toBeChecked();
  expect(preferences.assignment).toBe(false);
  await page.getByRole('button', { name: 'Test bildirimi gönder', exact: true }).click();
  await expect(page.getByText('Test bildirimi gönderim kuyruğuna eklendi.', { exact: true })).toBeVisible();
  expect(queued).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(async () => page.getByRole('complementary', { name: 'Ana menü' }).evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator('.notification-card').screenshot({ path: 'test-results/notification-settings-mobile.png' });
  await page.getByRole('button', { name: 'Bu cihazda kapat', exact: true }).click();
  await expect(page.getByText('Bu cihazda bildirimler kapalı.', { exact: true })).toBeVisible();
  expect(registered).toBe(false);
  await page.evaluate(() => {
    (window as unknown as { setPushPermission(value: NotificationPermission): void }).setPushPermission('denied');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByText('Bildirim izni engellenmiş.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bu cihazda bildirimleri aç', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { permissionRequests: number }).permissionRequests)).toBe(2);
});

test('dış adrese yönlendirme giriş sonrası dönüş adresi olarak kullanılamaz', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.0.0.91' });
  await page.goto('/giris?next=https%3A%2F%2Fexample.com');
  await page.getByLabel('E-posta').fill(admin.email);
  await page.getByLabel('Şifre', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4310/');
  await expect(page.getByRole('heading', { name: 'Genel Bakış', exact: true })).toBeVisible();
});
