import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspace } from './helpers.js';

describe('görev arşivi', () => {
  let ws: Awaited<ReturnType<typeof startWorkspace>>;
  let committee = '';
  const move = async (cookie: string, task: { id: string; version: number }, status: string) =>
    (await ws.request(`/api/tasks/${task.id}/transition`, cookie, 'POST', { status, version: task.version })).body;
  const archive = (cookie: string, task: { id: string; version: number }) =>
    ws.request(`/api/tasks/${task.id}/archive`, cookie, 'POST', { version: task.version });

  before(async () => {
    ws = await startWorkspace('gdg-archive-', ['lead', 'member']);
    committee = (await ws.request('/api/committees', ws.cookies.admin, 'POST', { name: 'Etkinlik' })).body.id;
    for (const [user, role] of [['lead', 'lead'], ['member', 'member']]) await ws.request(`/api/committees/${committee}/members/${ws.ids[user]}`, ws.cookies.admin, 'PUT', { role });
  });
  after(() => ws.stop());

  test('yalnız yönetici güncel sürümle arşivler; açık iş panodan ve sayımlardan çıkar', async () => {
    const { cookies } = ws;
    let task = (await ws.request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'İptal edilen iş' })).body;
    task = await move(cookies.member, task, 'in_review');
    assert.equal((await archive(cookies.member, task)).status, 403);
    assert.equal((await archive(cookies.lead, { ...task, version: task.version - 1 })).body.error.code, 'VERSION_CONFLICT');
    const archived = await archive(cookies.lead, task);
    assert.equal(archived.status, 200); assert.ok(archived.body.archivedAt);

    const board = (await ws.request(`/api/tasks?committeeId=${committee}`, cookies.member)).body as Array<{ id: string }>;
    assert.equal(board.some(item => item.id === task.id), false);
    assert.equal((await ws.request(`/api/tasks/${task.id}`, cookies.lead, 'PATCH', { version: task.version + 1, title: 'X' })).status, 404);
    assert.equal((await ws.request(`/api/tasks/${task.id}/details`, cookies.lead)).status, 404);
    const pending = ws.application.db.prepare("SELECT count(*) AS count FROM task_submissions WHERE task_id = ? AND resolution = 'pending'").get(task.id) as { count: number };
    assert.equal(pending.count, 0);
    const summary = (await ws.request('/api/reports/me', cookies.member)).body.summary;
    assert.deepEqual([summary.open, summary.inReview], [0, 0]);
    // The member no longer has open work here, so the committee can let them go.
    assert.equal((await ws.request(`/api/committees/${committee}/members/${ws.ids.member}`, cookies.admin, 'DELETE')).status, 200);
  });

  test('tamamlanmış iş arşivlense de raporda kalır', async () => {
    const { cookies } = ws;
    let task = (await ws.request('/api/tasks', cookies.lead, 'POST', { committeeId: committee, title: 'Biten iş' })).body;
    task = await move(cookies.lead, task, 'in_review');
    task = await move(cookies.lead, task, 'done');
    assert.equal((await archive(cookies.lead, task)).status, 200);
    const report = (await ws.request('/api/reports/me', cookies.lead)).body;
    assert.equal(report.summary.completed, 1);
    assert.ok(report.tasks.some((item: { id: string }) => item.id === task.id));
  });
});
