import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('push worker kişisel içerik göstermez ve yalnız izinli uygulama adreslerini açar', async () => {
  const handlers = new Map<string, (event: any) => void>();
  const shown: Array<{ title: string; options: any }> = [];
  const opened: string[] = [];
  let focused = 0;
  const origin = 'https://gdg.example.test';
  const worker = {
    location: { origin }, addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
    registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }); } },
    clients: { matchAll: async () => [{ url: `${origin}/panolar?gorev=t1`, focus: async () => { focused++; } }],
      openWindow: async (url: string) => { opened.push(url); } },
  };
  runInNewContext(readFileSync(new URL('../../web/public/sw.js', import.meta.url), 'utf8'), { self: worker, URL });
  async function dispatch(type: string, value: object) {
    let promise: Promise<unknown> | undefined;
    handlers.get(type)!({ ...value, waitUntil: (work: Promise<unknown>) => { promise = work; } });
    await promise;
  }
  await dispatch('push', { data: { json: () => ({ title: 'Özel kişi', body: 'Gizli yorum', url: 'https://attacker.test/x', tag: 'event-1' }) } });
  assert.equal(shown[0].title, 'GDG OSTİM');
  assert.equal(shown[0].options.body, 'Çalışma alanında bir güncelleme var.');
  assert.equal(shown[0].options.data.url, `${origin}/profilim`);
  await dispatch('push', { data: { json: () => { throw new Error('bad payload'); } } });
  assert.equal(shown.length, 2);
  for (const url of ['https://attacker.test/x', '//attacker.test/x', '/api/auth/sign-out', 'javascript:alert(1)']) {
    await dispatch('notificationclick', { notification: { close() {}, data: { url } } });
    assert.equal(opened.at(-1), `${origin}/profilim`);
  }
  await dispatch('notificationclick', { notification: { close() {}, data: { url: '/panolar?gorev=t1' } } });
  assert.equal(focused, 1);
  await dispatch('notificationclick', { notification: { close() {}, data: { url: '/panolar?gorev=t2' } } });
  assert.equal(opened.at(-1), `${origin}/panolar?gorev=t2`);
});
