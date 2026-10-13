import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspace } from './helpers.js';

const hours = (value: number) => new Date(Date.now() + value * 3_600_000).toISOString();

describe('rapor hesapları ve kapsamı', () => {
  let ws: Awaited<ReturnType<typeof startWorkspace>>;
  let events = ''; let media = '';
  const task: Record<string, { id: string; version: number }> = {};

  async function create(key: string, cookie: string, body: Record<string, unknown>) {
    const result = await ws.request('/api/tasks', cookie, 'POST', body);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    task[key] = { id: result.body.id, version: result.body.version };
  }
  async function move(key: string, cookie: string, status: string, reason?: string) {
    const result = await ws.request(`/api/tasks/${task[key].id}/transition`, cookie, 'POST', { status, version: task[key].version, ...(reason ? { reason } : {}) });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    task[key].version = result.body.version;
  }
  const db = () => ws.application.db;

  before(async () => {
    ws = await startWorkspace('gdg-reports-', ['lead', 'member', 'other', 'outsider']);
    const { request, cookies, ids } = ws;
    events = (await request('/api/committees', cookies.admin, 'POST', { name: 'Etkinlik' })).body.id;
    media = (await request('/api/committees', cookies.admin, 'POST', { name: 'Medya' })).body.id;
    for (const [committee, user, role] of [[events, 'lead', 'lead'], [events, 'member', 'member'], [events, 'other', 'member'], [media, 'member', 'member'], [media, 'outsider', 'lead']]) {
      await request(`/api/committees/${committee}/members/${ids[user]}`, cookies.admin, 'PUT', { role });
    }
    const { lead, member, outsider } = cookies;

    // Example 1: submitted before the deadline, approved later → on time.
    await create('onTime', member, { committeeId: events, title: 'Zamanında', dueAt: hours(2) });
    await move('onTime', member, 'in_review'); await move('onTime', lead, 'done');
    // Example 2: submitted after the deadline → late.
    await create('late', member, { committeeId: events, title: 'Geç', dueAt: hours(-2) });
    await move('late', member, 'in_review'); await move('late', lead, 'done');
    // Example 3: an on-time submission is rejected and the approved resubmission is late.
    await create('resubmitted', member, { committeeId: events, title: 'Yeniden teslim', dueAt: hours(2) });
    await move('resubmitted', member, 'in_review'); await move('resubmitted', lead, 'in_progress', 'Eksik');
    db().prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(hours(-1), task.resubmitted.id);
    await move('resubmitted', member, 'in_review'); await move('resubmitted', lead, 'done');
    // Undated completion, reopened completion, open overdue, on-time review and late review.
    await create('undated', member, { committeeId: events, title: 'Tarihsiz' });
    await move('undated', member, 'in_review'); await move('undated', lead, 'done');
    await create('reopened', member, { committeeId: events, title: 'Yeniden açılan', dueAt: hours(5) });
    await move('reopened', member, 'in_review'); await move('reopened', lead, 'done'); await move('reopened', lead, 'in_progress', 'Tarih değişti');
    await create('overdue', member, { committeeId: events, title: 'Gecikmiş açık', dueAt: hours(-3) });
    await create('reviewOnTime', member, { committeeId: events, title: 'İncelemede zamanında', dueAt: hours(1) });
    await move('reviewOnTime', member, 'in_review');
    db().prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(hours(-1), task.reviewOnTime.id);
    db().prepare("UPDATE task_submissions SET due_at_snapshot = ?, submitted_at = ? WHERE task_id = ? AND resolution = 'pending'").run(hours(-1), hours(-2), task.reviewOnTime.id);
    await create('reviewLate', member, { committeeId: events, title: 'İncelemede geç', dueAt: hours(-1) });
    await move('reviewLate', member, 'in_review');
    // Another person's work and a separate committee.
    await create('otherDone', lead, { committeeId: events, title: 'Diğer üye', assigneeId: ws.ids.other });
    await move('otherDone', lead, 'in_review'); await move('otherDone', lead, 'done');
    await create('mediaOpen', member, { committeeId: media, title: 'Medya görevi' });
    await create('outsiderOpen', outsider, { committeeId: media, title: 'Medya başkanı görevi', dueAt: hours(-4) });
  });
  after(async () => { await ws.stop(); });

  test('kişisel rapor teslim zamanını ve sorumlu görüntüsünü kullanır', async () => {
    const report = await ws.request('/api/reports/me', ws.cookies.member);
    assert.equal(report.status, 200);
    assert.deepEqual(report.body.summary, { completed: 4, onTime: 1, late: 2, undated: 1, openOverdue: 2, overdueTotal: 4, inReview: 2, open: 3 });
    const timings = Object.fromEntries(report.body.tasks.map((item: { title: string; timing: string | null }) => [item.title, item.timing]));
    assert.deepEqual(timings, {
      'Zamanında': 'on_time', 'Geç': 'late', 'Yeniden teslim': 'late', 'Tarihsiz': 'undated', 'Yeniden açılan': null,
      'Gecikmiş açık': 'overdue', 'İncelemede zamanında': null, 'İncelemede geç': 'overdue', 'Medya görevi': null,
    });
    const reopened = report.body.tasks.find((item: { title: string }) => item.title === 'Yeniden açılan');
    assert.deepEqual([reopened.status, reopened.reopens], ['in_progress', 1]);
    assert.equal(report.body.tasks.find((item: { title: string }) => item.title === 'Yeniden teslim').rejections, 1);
    assert.deepEqual(report.body.byCommittee.map((item: { name: string; summary: { completed: number } }) => [item.name, item.summary.completed]), [['Etkinlik', 4], ['Medya', 0]]);
  });

  test('komite başkanı kişileri yalnız kendi komitesi kapsamında görür', async () => {
    const scoped = await ws.request(`/api/reports/users/${ws.ids.member}`, ws.cookies.lead);
    assert.equal(scoped.status, 200);
    assert.deepEqual(scoped.body.committees.map((item: { name: string }) => item.name), ['Etkinlik']);
    assert.ok(scoped.body.tasks.every((item: { committeeName: string }) => item.committeeName === 'Etkinlik'));
    assert.equal(scoped.body.summary.open, 2);
    assert.equal((await ws.request(`/api/reports/users/${ws.ids.outsider}`, ws.cookies.lead)).status, 404);
    assert.equal((await ws.request(`/api/reports/users/${ws.ids.other}`, ws.cookies.member)).status, 404);
    assert.equal((await ws.request(`/api/reports/users/${ws.ids.member}`, ws.cookies.member)).status, 200);
    assert.equal((await ws.request(`/api/reports/users/${ws.ids.member}`, ws.cookies.admin)).body.tasks.length, 9);
  });

  test('komite raporu üye kırılımı verir ve eski üyenin tamamlanan işini korur', async () => {
    assert.equal((await ws.request(`/api/reports/committees/${events}`, ws.cookies.member)).status, 403);
    assert.equal((await ws.request(`/api/reports/committees/${events}`, ws.cookies.outsider)).status, 404);
    assert.equal((await ws.request(`/api/committees/${events}/members/${ws.ids.other}`, ws.cookies.admin, 'DELETE')).status, 200);
    const report = await ws.request(`/api/reports/committees/${events}`, ws.cookies.lead);
    assert.equal(report.status, 200);
    assert.equal(report.body.memberCount, 2);
    assert.deepEqual(report.body.summary, { completed: 5, onTime: 1, late: 2, undated: 2, openOverdue: 2, overdueTotal: 4, inReview: 2, open: 2 });
    const other = report.body.byPerson.find((item: { id: string }) => item.id === ws.ids.other);
    assert.deepEqual([other.role, other.summary.completed], [null, 1]);
  });

  test('genel rapor yalnız başkana açıktır ve görevleri bir kez sayar', async () => {
    assert.equal((await ws.request('/api/reports/overview', ws.cookies.lead)).status, 403);
    const report = await ws.request('/api/reports/overview', ws.cookies.admin);
    assert.equal(report.status, 200);
    assert.equal(report.body.summary.completed, 5);
    assert.equal(report.body.summary.open + report.body.summary.inReview + report.body.summary.completed, 11);
    assert.equal(report.body.summary.openOverdue, 3);
    assert.deepEqual([report.body.memberCount, report.body.committeeCount], [3, 2]);
    assert.deepEqual(report.body.byCommittee.map((item: { name: string; summary: { open: number } }) => [item.name, item.summary.open]), [['Etkinlik', 2], ['Medya', 2]]);
  });
});
