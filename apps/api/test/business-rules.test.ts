import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { boardLimits } from '../src/tasks.js';
import { startWorkspace } from './helpers.js';

const hours = (value: number) => new Date(Date.now() + value * 3_600_000).toISOString();

describe('kritik iş kuralları', () => {
  let ws: Awaited<ReturnType<typeof startWorkspace>>;
  let committee = '';
  const move = (cookie: string, task: { id: string; version: number }, status: string, reason?: string) =>
    ws.request(`/api/tasks/${task.id}/transition`, cookie, 'POST', { status, version: task.version, ...(reason ? { reason } : {}) });

  before(async () => {
    ws = await startWorkspace('gdg-rules-', ['lead', 'member']);
    committee = (await ws.request('/api/committees', ws.cookies.admin, 'POST', { name: 'Etkinlik' })).body.id;
    for (const [user, role] of [['lead', 'lead'], ['member', 'member']]) await ws.request(`/api/committees/${committee}/members/${ws.ids[user]}`, ws.cookies.admin, 'PUT', { role });
  });
  after(() => ws.stop());

  test('süresi dolmuş şifre bağlantısı reddedilir; yeni bağlantı çalışır', async () => {
    const { request, cookies, messages, application } = ws;
    const created = await request('/api/users', cookies.admin, 'POST', { name: 'Geç Kalan', email: 'gec@example.com' });
    assert.equal(created.body.invitation, 'sent');
    const token = new URL(messages.at(-1)!.url).pathname.split('/').at(-1)!;
    application.db.prepare('UPDATE verification SET expiresAt = ? WHERE identifier = ?').run(new Date(Date.now() - 60_000).toISOString(), `reset-password:${token}`);
    const expired = await request('/api/auth/reset-password', '', 'POST', { token, newPassword: 'Gec-Kalan-Sifresi-123!' });
    assert.equal(expired.status, 400);
    assert.equal((application.db.prepare('SELECT state FROM invitations WHERE user_id = ?').get(created.body.id) as { state: string }).state, 'sent');

    assert.equal((await request(`/api/users/${created.body.id}/invite`, cookies.admin, 'POST')).status, 200);
    const fresh = new URL(messages.at(-1)!.url).pathname.split('/').at(-1)!;
    assert.notEqual(fresh, token);
    assert.equal((await request('/api/auth/reset-password', '', 'POST', { token: fresh, newPassword: 'Gec-Kalan-Sifresi-123!' })).status, 200);
  });

  test('eşzamanlı onaylar tek onay kaydı üretir; çelişen kararlarda yalnız biri geçer', async () => {
    const { request, cookies } = ws;
    let task = (await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'Yarış' })).body;
    task = (await move(cookies.member, task, 'in_review')).body;
    // The same decision twice is a no-op for the second request, not a second approval.
    const approvals = await Promise.all([move(cookies.lead, task, 'done'), move(cookies.admin, task, 'done')]);
    assert.deepEqual(approvals.map(result => [result.status, result.body.version]), [[200, task.version + 1], [200, task.version + 1]]);
    const count = ws.application.db.prepare("SELECT count(*) AS count FROM task_submissions WHERE task_id = ? AND resolution = 'approved'").get(task.id) as { count: number };
    assert.equal(count.count, 1);

    let other = (await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'Çelişki' })).body;
    other = (await move(cookies.member, other, 'in_review')).body;
    const decisions = await Promise.all([move(cookies.lead, other, 'done'), move(cookies.admin, other, 'in_progress', 'Eksik var')]);
    assert.deepEqual(decisions.map(result => result.status).sort(), [200, 409]);
    const conflict = decisions.find(result => result.status === 409)!;
    assert.equal(conflict.body.error.code, 'VERSION_CONFLICT');
    assert.ok(conflict.body.current);
  });

  test('yeniden açılıp tekrar onaylanan iş bir kez ve son teslimine göre sayılır', async () => {
    const { request, cookies } = ws;
    let task = (await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'Tekrar biten', dueAt: hours(4) })).body;
    task = (await move(cookies.member, task, 'in_review')).body;
    task = (await move(cookies.lead, task, 'done')).body;
    let row = (await request('/api/reports/me', cookies.member)).body.tasks.find((item: { id: string }) => item.id === task.id);
    assert.equal(row.timing, 'on_time');

    task = (await move(cookies.lead, task, 'in_progress', 'Tarih yanlış')).body;
    ws.application.db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(hours(-1), task.id);
    task = (await move(cookies.member, task, 'in_review')).body;
    task = (await move(cookies.lead, task, 'done')).body;

    const report = (await request('/api/reports/me', cookies.member)).body;
    const rows = report.tasks.filter((item: { id: string }) => item.id === task.id);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].timing, rows[0].reopens], ['late', 1]);
    // Each completed task counts once, however many approvals its history has.
    const overview = (await request('/api/reports/overview', cookies.admin)).body.summary;
    const done = ws.application.db.prepare("SELECT count(*) AS count FROM tasks WHERE status = 'done' AND archived_at IS NULL").get() as { count: number };
    assert.equal(overview.completed, done.count);
  });

  test('eski tamamlanmış işler açık görevleri panodan düşürmez', async () => {
    const { request, cookies, application, ids } = ws;
    const stale = (await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'Unutulan açık iş' })).body;
    application.db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', stale.id);
    const insert = application.db.prepare(`INSERT INTO tasks (id, committee_id, title, assignee_id, created_by, status, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, 'done', ?, ?, ?)`);
    application.db.transaction(() => {
      // More than the old single 500-row cap, which hid the stale open task behind newer completions.
      for (let index = 0; index < 501; index++) {
        const at = new Date(Date.now() - index * 60_000).toISOString();
        insert.run(`bulk-${index}`, committee, `Biten ${index}`, ids.member, ids.lead, at, at, at);
      }
    })();
    const board = (await request(`/api/tasks?committeeId=${committee}`, cookies.member)).body as Array<{ id: string; status: string }>;
    assert.ok(board.some(task => task.id === stale.id));
    const done = board.filter(task => task.status === 'done');
    assert.equal(done.length, boardLimits.done);
    assert.ok(done.some(task => task.id === 'bulk-0'));
    assert.equal(done.some(task => task.id === `bulk-${boardLimits.done}`), false);
  });

  test('Better Auth yönetim uçları dışarı kapalıdır; yetkisi alınan başkan aynı oturumla yönetemez', async () => {
    const { request, cookies, ids } = ws;
    for (const path of ['/api/auth/admin/set-role', '/api/auth/admin/create-user', '/api/auth/admin/impersonate-user', '/api/auth/sign-up/email']) {
      assert.equal((await request(path, cookies.admin, 'POST', { userId: ids.member, role: 'super_admin' })).status, 404, path);
    }
    assert.equal((await request(`/api/users/${ids.lead}`, cookies.admin, 'PATCH', { role: 'super_admin' })).status, 200);
    assert.equal((await request('/api/users', cookies.lead)).status, 200);
    assert.equal((await request(`/api/users/${ids.lead}`, cookies.admin, 'PATCH', { role: 'user' })).status, 200);
    assert.equal((await request('/api/users', cookies.lead)).status, 403);
    assert.equal((await request('/api/reports/overview', cookies.lead)).status, 403);
  });
});
