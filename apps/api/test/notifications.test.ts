import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { startWorkspace } from './helpers.js';
import { createNotifications, pushMessages, reminderTime, storedVapidKeys, type PushPayload, type PushSender, validPushEndpoint } from '../src/notifications.js';
import { assertVapidPair, loadConfig } from '../src/config.js';

const keys = webpush.generateVAPIDKeys();
const config = { ...keys, subject: 'mailto:push@example.com' };
function subscription(name: string) {
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, expirationTime: null,
    keys: { p256dh: webpush.generateVAPIDKeys().publicKey, auth: randomBytes(16).toString('base64url') } };
}
async function workspace(send: PushSender = async () => {}) {
  const ws = await startWorkspace('gdg-push-', ['lead', 'member', 'outsider'], { config, send });
  const { request, cookies, ids } = ws;
  const committee = (await request('/api/committees', cookies.admin, 'POST', { name: 'Bildirim' })).body.id;
  for (const [user, role] of [['lead', 'lead'], ['member', 'member']]) {
    await request(`/api/committees/${committee}/members/${ids[user]}`, cookies.admin, 'PUT', { role });
  }
  const subscriptions = { lead: subscription('lead'), member: subscription('member'), outsider: subscription('outsider') };
  for (const user of ['lead', 'member', 'outsider'] as const) {
    assert.equal((await request('/api/me/push-subscriptions', cookies[user], 'POST', subscriptions[user])).status, 200);
    assert.equal((await request('/api/me/notification-preferences', cookies[user], 'PATCH', { enabled: true })).status, 200);
  }
  const create = async () => {
    const result = await request('/api/tasks', cookies.admin, 'POST', { committeeId: committee, assigneeId: ids.member, title: 'Özel görev başlığı' });
    assert.equal(result.status, 201); return result.body;
  };
  return { ...ws, committee, subscriptions, create, db: ws.application.db, drain: ws.application.notifications.drain };
}

test('VAPID yapılandırması açıkça etkinleşir; yanlış anahtarlar ve push hedefleri reddedilir', () => {
  const env = { BETTER_AUTH_SECRET: 'a'.repeat(32), PUSH_ENABLED: 'false' };
  assert.equal(loadConfig(env).push, undefined);
  assert.throws(() => loadConfig({ ...env, PUSH_ENABLED: 'true' }), /VAPID/);
  assert.throws(() => loadConfig({ ...env, PUSH_ENABLED: 'yes' }), /PUSH_ENABLED/);
  assert.deepEqual(loadConfig({ ...env, PUSH_ENABLED: 'true', VAPID_SUBJECT: config.subject, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }).push, config);
  assert.throws(() => loadConfig({ ...env, PUSH_ENABLED: 'true', VAPID_SUBJECT: config.subject, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: webpush.generateVAPIDKeys().privateKey }), /VAPID/);
  for (const url of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Q/x', 'https://wns2-test.notify.windows.com/w/?token=x']) assert.ok(validPushEndpoint(url));
  for (const url of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.test/x', 'https://evil.push.apple.com.evil.test/x', 'https://u:p@fcm.googleapis.com/x', 'https://fcm.googleapis.com:444/x', 'https://fcm.googleapis.com/x#y']) assert.equal(validPushEndpoint(url), false);
});

test('yapılandırılmamış bildirimler açık durum bildirmez ve abonelik açmaz', async () => {
  const ws = await startWorkspace('gdg-push-off-', []);
  try {
    const settings = (await ws.request('/api/me/notifications', ws.cookies.admin)).body;
    assert.equal(settings.configured, false); assert.equal(settings.publicKey, null);
    assert.equal((await ws.request('/api/me/push-subscriptions', ws.cookies.admin, 'POST', subscription('off'))).status, 503);
    assert.equal((await ws.request('/api/me/notification-preferences', ws.cookies.admin, 'PATCH', { enabled: true })).status, 503);
  } finally { await ws.stop(); }
});

test('abonelik sahipliği, oturum iptali ve otomatik yenileme hesaplar arasında korunur', async () => {
  const ws = await workspace();
  const { request, cookies, db, subscriptions, ids } = ws;
  try {
    assert.equal((await request('/api/me/notifications', '')).status, 401);
    assert.equal((await request('/api/me/push-subscriptions', cookies.outsider, 'POST', subscriptions.member)).status, 409);
    assert.equal((await request('/api/me/push-subscriptions', cookies.member, 'POST', { ...subscriptions.member, endpoint: 'https://localhost/x' })).status, 400);
    assert.equal((await request('/api/me/push-subscriptions', cookies.member, 'POST', { ...subscriptions.member, user_id: ids.outsider })).status, 400);
    assert.equal((await request('/api/me/notification-preferences', cookies.member, 'PATCH', { enabled: 'true' })).status, 400);
    assert.equal((await request('/api/me/notifications/test', cookies.outsider, 'POST', { endpoint: subscriptions.member.endpoint })).status, 404);
    await request('/api/me/push-subscriptions', cookies.outsider, 'DELETE', { endpoint: subscriptions.member.endpoint });
    assert.ok(db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(subscriptions.member.endpoint));
    await ws.create();
    assert.equal((await request('/api/auth/sign-out', cookies.member, 'POST', {})).status, 200);
    assert.equal(db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(subscriptions.member.endpoint), undefined);
    assert.equal(db.prepare('SELECT 1 FROM notification_outbox').get(), undefined);
    const renewed = await request('/api/me/push-subscriptions', cookies.outsider, 'POST', { ...subscriptions.member, renew: true });
    assert.deepEqual(renewed.body, { subscribed: false });
    assert.equal(db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(subscriptions.member.endpoint), undefined);
    await request(`/api/users/${ids.lead}`, cookies.admin, 'PATCH', { active: false });
    assert.equal(db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ?').get(ids.lead), undefined);
  } finally { await ws.stop(); }
});

test('atama, inceleme ve karar bildirimleri doğru kişiye gider; işlem ve kuyruk atomiktir', async () => {
  const sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  const ws = await workspace(async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); });
  const { request, cookies, db, ids } = ws;
  try {
    let task = await ws.create();
    await ws.drain();
    assert.equal(sent.length, 1); assert.equal(sent[0].endpoint, ws.subscriptions.member.endpoint);
    assert.ok(sent[0].payload.url.includes(`gorev=${task.id}`));
    assert.ok(!JSON.stringify(sent[0]).includes('Özel görev başlığı'));
    task = (await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version })).body;
    await ws.drain(); assert.equal(sent.length, 2); assert.equal(sent[1].endpoint, ws.subscriptions.lead.endpoint);
    task = (await request(`/api/tasks/${task.id}/transition`, cookies.lead, 'POST', { status: 'done', version: task.version })).body;
    await request(`/api/tasks/${task.id}/transition`, cookies.lead, 'POST', { status: 'done', version: task.version });
    await ws.drain(); assert.equal(sent.length, 3); assert.equal(sent[2].endpoint, ws.subscriptions.member.endpoint);
    await request('/api/tasks', cookies.member, 'POST', { committeeId: ws.committee, title: 'Kendim' });
    await ws.drain(); assert.equal(sent.length, 3);
    assert.equal((await request(`/api/tasks/${task.id}`, cookies.outsider)).status, 404);
    assert.equal((await request(`/api/tasks/${task.id}`, '')).status, 401);
    const before = (db.prepare('SELECT count(*) AS n FROM tasks').get() as { n: number }).n;
    db.exec("CREATE TRIGGER test_queue_failure BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT, 'test'); END");
    assert.equal((await request('/api/tasks', cookies.admin, 'POST', { committeeId: ws.committee, assigneeId: ids.member, title: 'Geri alınmalı' })).status, 500);
    assert.equal((db.prepare('SELECT count(*) AS n FROM tasks').get() as { n: number }).n, before);
  } finally { await ws.stop(); }
});

test('gönderim anında tercih, komite rolü ve oturum süresi yeniden kontrol edilir', async () => {
  let sent = 0;
  const ws = await workspace(async () => { sent++; });
  const { request, cookies, db, ids } = ws;
  try {
    const task = await ws.create();
    await request('/api/me/notification-preferences', cookies.member, 'PATCH', { assignment: false });
    await request('/api/me/notification-preferences', cookies.member, 'PATCH', { assignment: true });
    await ws.drain(); assert.equal(sent, 0);
    await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version });
    await request(`/api/committees/${ws.committee}/members/${ids.lead}`, cookies.admin, 'PUT', { role: 'member' });
    await ws.drain(); assert.equal(sent, 0);
    await ws.create();
    db.prepare('UPDATE session SET expiresAt = ? WHERE userId = ?').run(Date.now() - 1000, ids.member);
    await ws.drain(); assert.equal(sent, 0);
    assert.ok((db.prepare("SELECT count(*) AS n FROM notification_outbox WHERE state = 'skipped'").get() as { n: number }).n >= 3);
  } finally { await ws.stop(); }
});

test('kuyruk hata ve restart sonrası devam eder, eşzamanlı göndermez ve 410 aboneliğini siler', async () => {
  let attempts = 0;
  let status = 503;
  const ws = await workspace(async () => { attempts++; if (status) throw { statusCode: status, headers: { 'retry-after': '60' } }; });
  try {
    await ws.create();
    await Promise.all([ws.drain(), ws.drain()]); assert.equal(attempts, 1);
    const row = ws.db.prepare('SELECT state, attempts, next_at FROM notification_outbox').get() as { state: string; attempts: number; next_at: number };
    assert.equal(row.state, 'pending'); assert.equal(row.attempts, 1); assert.ok(row.next_at > Date.now() + 50_000);
    status = 0; ws.db.exec('UPDATE notification_outbox SET next_at = 0');
    const restarted = createNotifications(ws.db, { push: config } as Parameters<typeof createNotifications>[1], async () => { attempts++; });
    await restarted.drain(); restarted.stop(); assert.equal(attempts, 2);
    assert.equal((ws.db.prepare('SELECT state FROM notification_outbox').get() as { state: string }).state, 'sent');
    status = 410; await ws.create(); await ws.drain();
    assert.equal(ws.db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ?').get(ws.ids.member), undefined);
  } finally { await ws.stop(); }
});

test('anahtarsız etkinleştirmede VAPID çifti bir kez üretilir ve veritabanında korunur', async () => {
  const env = { BETTER_AUTH_SECRET: 'a'.repeat(32), PUSH_ENABLED: 'true', VAPID_SUBJECT: 'https://gdg.example.test' };
  assert.deepEqual([loadConfig(env).push, loadConfig(env).pushSubject], [undefined, 'https://gdg.example.test']);
  assert.throws(() => loadConfig({ ...env, VAPID_PUBLIC_KEY: keys.publicKey }), /VAPID/);
  const ws = await startWorkspace('gdg-push-keys-', []);
  try {
    const first = storedVapidKeys(ws.application.db);
    assert.deepEqual(storedVapidKeys(ws.application.db), first);
    assert.doesNotThrow(() => assertVapidPair(first.publicKey, first.privateKey));
  } finally { await ws.stop(); }
});

test('hatırlatma son tarihten 24 saat önce, gece saatlerinde 09:00 İstanbul’da planlanır', () => {
  assert.equal(new Date(reminderTime('2026-10-20T12:00:00.000Z')!).toISOString(), '2026-10-19T12:00:00.000Z');
  // 23:59 İstanbul son tarihi: bir önceki gece yerine son gün sabah 09:00.
  assert.equal(new Date(reminderTime('2026-10-20T20:59:59.000Z')!).toISOString(), '2026-10-20T06:00:00.000Z');
  assert.equal(new Date(reminderTime('2026-10-20T03:30:00.000Z')!).toISOString(), '2026-10-19T06:00:00.000Z');
  assert.equal(reminderTime('geçersiz'), null);
});

test('son tarih hatırlatması tektir, tercihe uyar ve son tarih değişince eskisi geçersizleşir', async () => {
  const sent: PushPayload[] = [];
  const ws = await workspace(async (_sub, payload) => { sent.push(payload); });
  const { request, cookies, db } = ws;
  const reminders = () => sent.filter(payload => payload.body === pushMessages.reminder);
  try {
    let task = await ws.create();
    await ws.drain();
    assert.deepEqual(sent.map(payload => payload.body), [pushMessages.assignment]);
    const due = new Date(Date.now() + 2 * 3_600_000).toISOString();
    task = (await request(`/api/tasks/${task.id}`, cookies.admin, 'PATCH', { version: task.version, dueAt: due })).body;
    db.prepare('UPDATE tasks SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 3 * 86_400_000).toISOString(), task.id);
    ws.application.notifications.scheduleReminders(); ws.application.notifications.scheduleReminders();
    await ws.drain();
    assert.equal(reminders().length, 1); assert.ok(reminders()[0].url.includes(`gorev=${task.id}`));
    ws.application.notifications.scheduleReminders(); await ws.drain();
    assert.equal(reminders().length, 1);

    // A queued reminder for an old deadline is dropped; the new deadline gets its own.
    db.prepare("UPDATE notification_outbox SET state = 'sent' WHERE kind = 'reminder'").run();
    ws.application.notifications.scheduleReminders();
    const moved = new Date(Date.now() + 3 * 3_600_000).toISOString();
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(moved, task.id);
    db.prepare("UPDATE notification_outbox SET state = 'pending', event_id = ? WHERE kind = 'reminder'").run(`${task.id}:${due}:reminder`);
    await ws.drain();
    assert.equal(reminders().length, 1);
    ws.application.notifications.scheduleReminders(); await ws.drain();
    assert.equal(reminders().length, 2);

    await request('/api/me/notification-preferences', cookies.member, 'PATCH', { reminder: false });
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(new Date(Date.now() + 4 * 3_600_000).toISOString(), task.id);
    ws.application.notifications.scheduleReminders(); await ws.drain();
    assert.equal(reminders().length, 2);

    // Submitted work and tasks created after their reminder moment are not reminded.
    await request('/api/me/notification-preferences', cookies.member, 'PATCH', { reminder: true });
    const fresh = (await request('/api/tasks', cookies.admin, 'POST', { committeeId: ws.committee, assigneeId: ws.ids.member, title: 'Yeni', dueAt: new Date(Date.now() + 3_600_000).toISOString() })).body;
    task = (await request(`/api/tasks/${task.id}`, cookies.member)).body;
    await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version });
    ws.application.notifications.scheduleReminders(); await ws.drain();
    assert.equal(reminders().length, 2);
    assert.ok(fresh.id);
  } finally { await ws.stop(); }
});

test('bildirim metni türü söyler ama görev, kişi veya yorum içermez', async () => {
  const sent: PushPayload[] = [];
  const ws = await workspace(async (_sub, payload) => { sent.push(payload); });
  const { request, cookies } = ws;
  try {
    let task = await ws.create(); await ws.drain();
    task = (await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version })).body; await ws.drain();
    task = (await request(`/api/tasks/${task.id}/transition`, cookies.lead, 'POST', { status: 'in_progress', version: task.version, reason: 'Gizli ret gerekçesi' })).body; await ws.drain();
    task = (await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version })).body; await ws.drain();
    await request(`/api/tasks/${task.id}/transition`, cookies.lead, 'POST', { status: 'done', version: task.version }); await ws.drain();
    assert.deepEqual(sent.map(payload => payload.body), [pushMessages.assignment, pushMessages.review, pushMessages.returned, pushMessages.review, pushMessages.approved]);
    assert.ok(!JSON.stringify(sent).includes('Gizli ret gerekçesi')); assert.ok(!JSON.stringify(sent).includes('Özel görev başlığı'));
  } finally { await ws.stop(); }
});

test('test bildirimi yalnız mevcut cihazı kullanır ve sıklığı sınırlanır', async () => {
  const ws = await workspace();
  try {
    const body = { endpoint: ws.subscriptions.member.endpoint };
    assert.equal((await ws.request('/api/me/notifications/test', ws.cookies.member, 'POST', body)).status, 202);
    assert.equal((await ws.request('/api/me/notifications/test', ws.cookies.member, 'POST', body)).status, 429);
    await ws.drain();
    assert.equal((ws.db.prepare("SELECT state FROM notification_outbox WHERE kind = 'test'").get() as { state: string }).state, 'sent');
  } finally { await ws.stop(); }
});
