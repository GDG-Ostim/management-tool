import { expect, test } from '@playwright/test';

test('PWA manifesti ve simgeler geçerli; çevrimdışı ekran kişisel veri saklamaz', async ({ page, context, request }) => {
  await page.goto('/giris');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', lang: 'tr' });
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(size).toBe(icon.sizes);
  }
  const cdp = await context.newCDPSession(page);
  const { errors } = await cdp.send('Page.getAppManifest');
  expect(errors).toEqual([]);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  await page.evaluate(() => fetch('/api/me'));
  const cachedPaths = await page.evaluate(async () => {
    const paths = await Promise.all((await caches.keys()).map(async name =>
      (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)));
    return paths.flat();
  });
  expect(cachedPaths).toEqual(['/offline.html']);
  await context.setOffline(true);
  await page.goto('/panolar?komite=offline-test');
  await expect(page.getByRole('heading', { name: 'İnternet bağlantısı yok' })).toBeVisible();
  expect(await page.evaluate(() => fetch('/api/me').then(() => false, () => true))).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: 'test-results/pwa-offline-mobile.png' });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Yeniden dene' }).click();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
});
