import { createHash, ECDH, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns';
import { Agent } from 'node:https';
import { BlockList } from 'node:net';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import webpush from 'web-push';
import { plainObject } from './access.js';
import { assertVapidPair, type Config } from './config.js';
import { HttpError } from './errors.js';

type Kind = 'assignment' | 'review' | 'decision' | 'reminder';
export type Preferences = { enabled: boolean; assignment: boolean; review: boolean; decision: boolean; reminder: boolean };
const defaults: Preferences = { enabled: false, assignment: true, review: true, decision: true, reminder: true };
const preferenceKeys = Object.keys(defaults) as Array<keyof Preferences>;
type Subscription = { id: string; user_id: string; session_id: string; endpoint: string; p256dh: string; auth: string };
type Job = { id: string; event_id: string; subscription_id: string; task_id: string | null; kind: Kind | 'test'; attempts: number; created_at: number };
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushSender = (subscription: webpush.PushSubscription, payload: PushPayload) => Promise<unknown>;

/** Only browser push providers, never arbitrary user-supplied HTTP destinations. */
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && url.pathname.length > 1
      && (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com'
        || /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(url.hostname)
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
        || url.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname));
  } catch { return false; }
}

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked.addSubnet(address, prefix, 'ipv6');

function sender(config: NonNullable<Config['push']>): PushSender {
  // Pin the checked DNS answer to the socket; web-push uses https.request and does not follow redirects.
  const agent = new Agent({ lookup(hostname, options, callback) {
    lookup(hostname, { all: true }, (error, addresses) => {
      if (error) { callback(error, '', 4); return; }
      if (!addresses.length || addresses.some(item => blocked.check(item.address, item.family === 6 ? 'ipv6' : 'ipv4'))) {
        callback(new Error('Push hedefi reddedildi.'), '', 4); return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  } });
  return (subscription, payload) => webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: config, TTL: 3600, timeout: 10_000, agent,
    topic: createHash('sha256').update(payload.tag).digest('base64url').slice(0, 32),
  });
}

/**
 * The key pair is created once and kept with the data, so restarts and image updates keep every device
 * subscription valid. The private key never leaves the server; backups carry it like any other server secret.
 */
export function storedVapidKeys(db: Database.Database): { publicKey: string; privateKey: string } {
  const read = () => db.prepare("SELECT value FROM app_settings WHERE key = 'vapid_keys'").get() as { value: string } | undefined;
  if (!read()) {
    const keys = webpush.generateVAPIDKeys();
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vapid_keys', ?)").run(JSON.stringify(keys));
  }
  const { publicKey, privateKey } = JSON.parse(read()!.value) as { publicKey: string; privateKey: string };
  assertVapidPair(publicKey, privateKey);
  return { publicKey, privateKey };
}

export function notificationPreferences(db: Database.Database, userId: string): Preferences {
  const row = db.prepare('SELECT enabled, assignment, review, decision, reminder FROM notification_preferences WHERE user_id = ?').get(userId) as Record<keyof Preferences, number> | undefined;
  return row ? Object.fromEntries(preferenceKeys.map(key => [key, row[key] === 1])) as Preferences : { ...defaults };
}

/** Lock-screen text names the kind of update only; titles, people and comments never leave the app. */
export const pushMessages = {
  test: 'Bu cihazda bildirimler çalışıyor.',
  assignment: 'Sana yeni bir görev atandı.',
  review: 'İncelemeni bekleyen bir teslim var.',
  approved: 'Görevin onaylandı.',
  returned: 'Görevin düzeltme için sana geri döndü.',
  reminder: 'Bir görevinin son tarihi yaklaşıyor.',
} as const;

const HOUR = 3_600_000;
const ISTANBUL_OFFSET = 3 * HOUR; // Türkiye has used UTC+3 all year since 2016.

/**
 * One reminder 24 hours before the deadline. A reminder that would arrive between 22:00 and 09:00
 * Istanbul time waits for 09:00; it is dropped when that is no longer before the deadline.
 */
export function reminderTime(dueAt: string): number | null {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return null;
  const local = new Date(due - 24 * HOUR + ISTANBUL_OFFSET);
  const hour = local.getUTCHours();
  if (hour >= 22 || hour < 9) {
    if (hour >= 22) local.setUTCDate(local.getUTCDate() + 1);
    local.setUTCHours(9, 0, 0, 0);
  }
  const at = local.getTime() - ISTANBUL_OFFSET;
  return at < due ? at : null;
}
const reminderEvent = (taskId: string, dueAt: string) => `${taskId}:${dueAt}:reminder`;

/** Called inside the task mutation's transaction; no network requests or timers here. */
export function enqueueTaskNotification(db: Database.Database, taskId: string, kind: Kind, actorId: string) {
  const task = db.prepare('SELECT committee_id, assignee_id, version FROM tasks WHERE id = ?').get(taskId) as { committee_id: string; assignee_id: string; version: number };
  const users = kind === 'review'
    ? (db.prepare("SELECT user_id FROM committee_memberships WHERE committee_id = ? AND role = 'lead'").all(task.committee_id) as Array<{ user_id: string }>).map(row => row.user_id)
    : [task.assignee_id];
  const now = Date.now();
  for (const userId of users) {
    const prefs = notificationPreferences(db, userId);
    if (userId === actorId || !prefs.enabled || !prefs[kind]) continue;
    const subscriptions = db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ?').all(userId) as Array<{ id: string }>;
    for (const subscription of subscriptions) db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, event_id, subscription_id, task_id, kind, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), `${taskId}:${task.version}:${kind}`, subscription.id, taskId, kind, now, now);
  }
}

export function createNotifications(db: Database.Database, config: Config, send: PushSender | undefined = config.push ? sender(config.push) : undefined) {
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const configured = !!config.push && !!send;
  const requireConfigured = () => {
    if (!configured) throw new HttpError(503, 'PUSH_UNAVAILABLE', 'Bildirimler sunucuda henüz etkinleştirilmedi.');
  };
  const finish = (id: string, state: string) => db.prepare('UPDATE notification_outbox SET state = ?, completed_at = ?, lease_until = NULL WHERE id = ?').run(state, Date.now(), id);

  let lastReminderScan = 0;
  /** Queues due reminders; the event id carries the deadline, so a changed deadline gets its own single reminder. */
  function scheduleReminders(now = Date.now()) {
    lastReminderScan = now;
    // A reminder is never earlier than 24 hours before the deadline, so later deadlines cannot be due yet.
    const tasks = db.prepare(`SELECT t.id, t.assignee_id AS assigneeId, t.due_at AS dueAt, t.created_at AS createdAt FROM tasks t
      JOIN committees c ON c.id = t.committee_id
      WHERE t.archived_at IS NULL AND c.archived_at IS NULL AND t.status IN ('todo','in_progress')
        AND t.due_at IS NOT NULL AND t.due_at > ? AND t.due_at <= ?`)
      .all(new Date(now).toISOString(), new Date(now + 24 * HOUR).toISOString()) as Array<{ id: string; assigneeId: string; dueAt: string; createdAt: string }>;
    const insert = db.prepare(`INSERT OR IGNORE INTO notification_outbox (id, event_id, subscription_id, task_id, kind, next_at, created_at)
      VALUES (?, ?, ?, ?, 'reminder', ?, ?)`);
    db.transaction(() => {
      for (const task of tasks) {
        const at = reminderTime(task.dueAt);
        // A task created after its reminder moment already announced itself through the assignment.
        if (at === null || at > now || at < Date.parse(task.createdAt)) continue;
        const prefs = notificationPreferences(db, task.assigneeId);
        if (!prefs.enabled || !prefs.reminder) continue;
        for (const { id } of db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ?').all(task.assigneeId) as Array<{ id: string }>) {
          insert.run(randomUUID(), reminderEvent(task.id, task.dueAt), id, task.id, now, now);
        }
      }
    })();
  }

  async function drain() {
    if (!configured || running || disposed) return;
    running = true;
    try {
      if (Date.now() - lastReminderScan >= 60_000) scheduleReminders();
      // A send timeout is 10s, while the durable lease is 60s. Crashed workers can be retried.
      for (let count = 0; count < 20 && !disposed; count++) {
        const now = Date.now();
        const job = db.prepare(`UPDATE notification_outbox SET state = 'sending', attempts = attempts + 1, lease_until = ?
          WHERE id = (SELECT id FROM notification_outbox WHERE (state = 'pending' AND next_at <= ?)
            OR (state = 'sending' AND lease_until <= ?) ORDER BY created_at LIMIT 1) RETURNING *`).get(now + 60_000, now, now) as Job | undefined;
        if (!job) break;
        const sub = db.prepare(`SELECT p.* FROM push_subscriptions p JOIN user_profiles u ON u.user_id = p.user_id
          JOIN invitations i ON i.user_id = p.user_id WHERE p.id = ? AND u.active = 1 AND i.state = 'accepted'`).get(job.subscription_id) as Subscription | undefined;
        const session = sub && db.prepare('SELECT expiresAt FROM session WHERE id = ? AND userId = ?').get(sub.session_id, sub.user_id) as { expiresAt: string | number } | undefined;
        if (!sub || !session || !(new Date(session.expiresAt).getTime() > now) || now - job.created_at > 86_400_000 || job.attempts > 5) {
          finish(job.id, 'skipped'); continue;
        }
        const prefs = notificationPreferences(db, sub.user_id);
        if (!prefs.enabled || (job.kind !== 'test' && !prefs[job.kind])) { finish(job.id, 'skipped'); continue; }
        let url = '/profilim';
        let body: string = pushMessages.test;
        if (job.task_id) {
          const task = db.prepare(`SELECT t.committee_id, t.assignee_id, t.status, t.due_at, m.role FROM tasks t
            JOIN committees c ON c.id = t.committee_id
            JOIN committee_memberships m ON m.committee_id = t.committee_id AND m.user_id = ?
            WHERE t.id = ? AND t.archived_at IS NULL AND c.archived_at IS NULL`).get(sub.user_id, job.task_id) as { committee_id: string; assignee_id: string; status: string; due_at: string | null; role: string } | undefined;
          const stale = !task || (job.kind === 'review' ? task.role !== 'lead' || task.status !== 'in_review' : task.assignee_id !== sub.user_id)
            // A reminder is void once the work is submitted or the deadline it was planned for has moved.
            || (job.kind === 'reminder' && (!['todo', 'in_progress'].includes(task.status) || !task.due_at || job.event_id !== reminderEvent(job.task_id, task.due_at)));
          if (stale) { finish(job.id, 'skipped'); continue; }
          url = `/panolar?komite=${encodeURIComponent(task.committee_id)}&gorev=${encodeURIComponent(job.task_id)}`;
          body = job.kind === 'decision' ? (task.status === 'done' ? pushMessages.approved : pushMessages.returned) : pushMessages[job.kind as Exclude<Kind, 'decision'>];
        }
        if (!validPushEndpoint(sub.endpoint)) { db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id); continue; }
        try {
          await send!({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, {
            title: 'GDG OSTİM', body, url, tag: `gdg-${job.event_id}`,
          });
          if (disposed) break;
          finish(job.id, 'sent');
        } catch (error) {
          if (disposed) break;
          const status = typeof (error as { statusCode?: unknown })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 0;
          if (status === 404 || status === 410) { db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id); continue; }
          if (job.attempts >= 5 || (status >= 400 && status < 500 && status !== 429) || (status >= 300 && status < 400)) {
            finish(job.id, 'failed'); console.warn(`Bildirim gönderilemedi (durum: ${status || 'ağ'}).`); continue;
          }
          const retry = (error as { headers?: Record<string, string> })?.headers?.['retry-after'];
          const retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
          const delay = Math.min(3_600_000, Math.max(30_000 * 2 ** (job.attempts - 1), Number.isFinite(retryMs) ? retryMs : 0));
          db.prepare("UPDATE notification_outbox SET state = 'pending', next_at = ?, lease_until = NULL WHERE id = ?").run(Date.now() + delay, job.id);
        }
      }
      if (!disposed) db.prepare("DELETE FROM notification_outbox WHERE state IN ('sent','failed','skipped') AND completed_at < ?").run(Date.now() - 30 * 86_400_000);
    } finally { running = false; }
  }

  function register(app: Express, requireMember: RequestHandler, throttle: RequestHandler) {
    app.get('/api/me/notifications', requireMember, (_req, res) => {
      res.json({ configured, publicKey: configured ? config.push!.publicKey : null, preferences: notificationPreferences(db, res.locals.user.id) });
    });
    app.patch('/api/me/notification-preferences', requireMember, throttle, (req, res) => {
      const body = plainObject(req.body, preferenceKeys);
      if (!Object.keys(body).length || Object.values(body).some(value => typeof value !== 'boolean')) throw new HttpError(400, 'INVALID_PREFERENCES', 'Bildirim tercihleri geçersiz.');
      if (body.enabled === true) requireConfigured();
      const next = { ...notificationPreferences(db, res.locals.user.id), ...body } as Preferences;
      db.transaction(() => {
        db.prepare(`INSERT INTO notification_preferences (user_id, enabled, assignment, review, decision, reminder) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, assignment = excluded.assignment, review = excluded.review,
            decision = excluded.decision, reminder = excluded.reminder`)
          .run(res.locals.user.id, ...preferenceKeys.map(key => Number(next[key])));
        // Do not replay old notifications after a preference is switched off and later re-enabled.
        for (const key of preferenceKeys.filter(key => !next[key])) db.prepare(`UPDATE notification_outbox SET state = 'skipped', completed_at = ?
          WHERE state = 'pending' AND subscription_id IN (SELECT id FROM push_subscriptions WHERE user_id = ?) ${key === 'enabled' ? '' : 'AND kind = ?'}`)
          .run(Date.now(), res.locals.user.id, ...(key === 'enabled' ? [] : [key]));
      })();
      res.json(next);
    });
    app.post('/api/me/push-subscriptions', requireMember, throttle, (req, res) => {
      requireConfigured();
      const body = plainObject(req.body, ['endpoint', 'keys', 'expirationTime', 'renew']);
      if (body.renew !== undefined && typeof body.renew !== 'boolean') throw new HttpError(400, 'INVALID_SUBSCRIPTION', 'Cihaz aboneliği geçersiz.');
      const keys = plainObject(body.keys, ['p256dh', 'auth']);
      if (!validPushEndpoint(body.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string'
        || !/^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth)) {
        throw new HttpError(400, 'INVALID_SUBSCRIPTION', 'Cihaz aboneliği geçersiz veya bildirim sağlayıcısı desteklenmiyor.');
      }
      try { ECDH.convertKey(Buffer.from(keys.p256dh, 'base64url'), 'prime256v1'); }
      catch { throw new HttpError(400, 'INVALID_SUBSCRIPTION', 'Cihaz anahtarı geçersiz.'); }
      const endpoint = body.endpoint;
      const existing = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as Subscription | undefined;
      if (existing && existing.user_id !== res.locals.user.id) throw new HttpError(409, 'SUBSCRIPTION_OWNER', 'Bu cihazın eski aboneliğini kapatıp yeniden etkinleştir.');
      // Automatic reconciliation must not opt a new account/device in after logout or expiry.
      if (body.renew === true && !existing) { res.json({ subscribed: false }); return; }
      const total = (db.prepare('SELECT count(*) AS count FROM push_subscriptions WHERE user_id = ?').get(res.locals.user.id) as { count: number }).count;
      if (!existing && total >= 10) throw new HttpError(409, 'DEVICE_LIMIT', 'En çok 10 cihaz kullanılabilir. Diğer cihazlardaki oturumlarını kapat.');
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO push_subscriptions (id, user_id, session_id, endpoint, p256dh, auth, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET session_id = excluded.session_id,
        p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = excluded.last_seen_at`)
        .run(existing?.id ?? randomUUID(), res.locals.user.id, res.locals.sessionId, endpoint, keys.p256dh, keys.auth, now, now);
      res.json({ subscribed: true });
    });
    app.delete('/api/me/push-subscriptions', requireMember, throttle, (req, res) => {
      const { endpoint } = plainObject(req.body, ['endpoint']);
      if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new HttpError(400, 'INVALID_SUBSCRIPTION', 'Cihaz aboneliği geçersiz.');
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, res.locals.user.id);
      res.json({ subscribed: false });
    });
    app.post('/api/me/notifications/test', requireMember, throttle, (req, res) => {
      requireConfigured();
      const { endpoint } = plainObject(req.body, ['endpoint']);
      if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new HttpError(400, 'INVALID_SUBSCRIPTION', 'Cihaz aboneliği geçersiz.');
      const sub = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ? AND session_id = ?').get(endpoint, res.locals.user.id, res.locals.sessionId) as { id: string } | undefined;
      if (!sub) throw new HttpError(404, 'NOT_FOUND', 'Etkin cihaz aboneliği bulunamadı.');
      if (!notificationPreferences(db, res.locals.user.id).enabled) throw new HttpError(409, 'PUSH_DISABLED', 'Önce bildirimleri aç.');
      const recent = db.prepare("SELECT 1 FROM notification_outbox WHERE subscription_id = ? AND kind = 'test' AND created_at > ?").get(sub.id, Date.now() - 60_000);
      if (recent) throw new HttpError(429, 'RATE_LIMIT', 'Test bildirimini bir dakika sonra yeniden deneyebilirsin.');
      const now = Date.now();
      db.prepare("INSERT INTO notification_outbox (id, event_id, subscription_id, kind, next_at, created_at) VALUES (?, ?, ?, 'test', ?, ?)")
        .run(randomUUID(), randomUUID(), sub.id, now, now);
      res.status(202).json({ queued: true });
    });
  }
  return { register, drain, scheduleReminders, start() {
    if (!configured || timer || disposed) return;
    timer = setInterval(() => { void drain().catch(() => console.warn('Bildirim kuyruğu işlenemedi.')); }, 5000);
    timer.unref();
  }, stop() { disposed = true; if (timer) clearInterval(timer); } };
}
