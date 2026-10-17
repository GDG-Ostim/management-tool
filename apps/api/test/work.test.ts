import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createApplication } from '../src/app.js';
import { bootstrap } from '../src/identity.js';
import type { PasswordMail } from '../src/mail.js';

async function freePort() {
  const probe = createServer();
  await new Promise<void>(done => probe.listen(0, '127.0.0.1', done));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Test portu alınamadı.');
  await new Promise<void>((done, fail) => probe.close(error => error ? fail(error) : done()));
  return address.port;
}

describe('komite ve görev akışı', () => {
  let directory: string;
  let origin: string;
  let application: Awaited<ReturnType<typeof createApplication>>;
  let server: Server;
  const messages: PasswordMail[] = [];
  const cookies: Record<'admin' | 'lead' | 'member' | 'other' | 'outsider', string> = { admin: '', lead: '', member: '', other: '', outsider: '' };
  const ids: Record<string, string> = {};
  let committeeId = '';
  let otherCommitteeId = '';

  async function request(path: string, cookie: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${origin}${path}`, { method, headers: { origin, cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  }

  async function signIn(email: string, password: string) {
    const result = await application.auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    return result.headers.get('set-cookie')!.split(';')[0];
  }

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gdg-work-'));
    const passwordFile = join(directory, 'password.txt');
    await writeFile(passwordFile, 'Guclu-Baslangic-Sifresi-123!');
    const port = await freePort(); origin = `http://127.0.0.1:${port}`;
    application = await createApplication({ appUrl: origin, secret: 'test-secret-that-is-at-least-32-characters-long', databasePath: join(directory, 'work.sqlite'), port, host: '127.0.0.1', production: false },
      { async sendPasswordLink(message) { messages.push(message); } });
    server = application.app.listen(port, '127.0.0.1');
    await new Promise<void>((done, fail) => { server.once('listening', done); server.once('error', fail); });
    await bootstrap(application.auth, application.db, { email: 'baskan@example.com', name: 'Başkan', passwordFile });
    cookies.admin = await signIn('baskan@example.com', 'Guclu-Baslangic-Sifresi-123!');
    for (const key of ['lead', 'member', 'other', 'outsider'] as const) {
      const created = await request('/api/users', cookies.admin, 'POST', { name: key, email: `${key}@example.com` });
      ids[key] = created.body.id;
      const token = new URL(messages.at(-1)!.url).pathname.split('/').at(-1)!;
      await application.auth.api.resetPassword({ body: { token, newPassword: `${key}-Sifresi-12345` } });
      cookies[key] = await signIn(`${key}@example.com`, `${key}-Sifresi-12345`);
    }
  });

  after(async () => {
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
    application.close();
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep + 'gdg-work-')) throw new Error('Güvensiz test temizleme yolu');
    await rm(target, { recursive: true, force: true });
  });

  test('başkan komite kurar ve üyelikleri yönetir; diğerleri yalnız kendi komitesini görür', async () => {
    assert.equal((await request('/api/committees', cookies.lead, 'POST', { name: 'Etkinlik' })).status, 403);
    const created = await request('/api/committees', cookies.admin, 'POST', { name: 'Etkinlik', description: 'Etkinlik ekibi' });
    assert.equal(created.status, 201); committeeId = created.body.id;
    assert.equal((await request('/api/committees', cookies.admin, 'POST', { name: 'etkinlik' })).status, 409);
    otherCommitteeId = (await request('/api/committees', cookies.admin, 'POST', { name: 'Medya' })).body.id;
    assert.equal((await request(`/api/committees/${committeeId}/members/${ids.lead}`, cookies.admin, 'PUT', { role: 'lead' })).status, 200);
    assert.equal((await request(`/api/committees/${committeeId}/members/${ids.member}`, cookies.admin, 'PUT', { role: 'member' })).status, 200);
    const withOther = await request(`/api/committees/${committeeId}/members/${ids.other}`, cookies.admin, 'PUT', { role: 'member' });
    assert.equal(withOther.body.memberCount, 3);
    assert.equal((await request(`/api/committees/${otherCommitteeId}/members/${ids.outsider}`, cookies.admin, 'PUT', { role: 'member' })).status, 200);
    assert.equal((await request(`/api/committees/${committeeId}/members/${ids.member}`, cookies.admin, 'PUT', { role: 'owner' })).status, 400);

    const memberView = await request('/api/committees', cookies.member);
    assert.deepEqual(memberView.body.map((row: { name: string; myRole: string }) => [row.name, row.myRole]), [['Etkinlik', 'member']]);
    assert.equal((await request(`/api/committees/${otherCommitteeId}`, cookies.member)).status, 404);
    assert.equal((await request('/api/committees', cookies.admin)).body.length, 2);
  });

  test('görev açma yetkisi ve atama sınırı sunucuda uygulanır', async () => {
    const own = await request('/api/tasks', cookies.member, 'POST', { committeeId, title: 'Afiş taslağı', dueAt: '2026-10-20T20:59:59.000Z' });
    assert.equal(own.status, 201); assert.equal(own.body.assigneeId, ids.member); ids.memberTask = own.body.id;
    assert.deepEqual(own.body.permissions, { edit: true, manage: false, moves: ['in_progress', 'in_review'] });
    assert.equal((await request('/api/tasks', cookies.member, 'POST', { committeeId, title: 'Başkasına', assigneeId: ids.other })).status, 403);
    assert.equal((await request('/api/tasks', cookies.outsider, 'POST', { committeeId, title: 'Dışarıdan' })).status, 404);
    assert.equal((await request('/api/tasks', cookies.lead, 'POST', { committeeId, title: 'Yanlış atama', assigneeId: ids.outsider })).status, 400);
    assert.equal((await request('/api/tasks', cookies.lead, 'POST', { committeeId, title: '' })).status, 400);
    const assigned = await request('/api/tasks', cookies.lead, 'POST', { committeeId, title: 'Sponsor listesi', assigneeId: ids.other, priority: 'high' });
    assert.equal(assigned.status, 201); ids.otherTask = assigned.body.id;
    await request('/api/tasks', cookies.admin, 'POST', { committeeId: otherCommitteeId, title: 'Medya planı', assigneeId: ids.outsider });

    const board = await request(`/api/tasks?committeeId=${committeeId}`, cookies.member);
    assert.equal(board.body.length, 2);
    const foreign = board.body.find((task: { id: string }) => task.id === ids.otherTask);
    assert.deepEqual(foreign.permissions, { edit: false, manage: false, moves: [] });
    assert.equal((await request('/api/tasks', cookies.member)).body.length, 2);
    assert.equal((await request('/api/tasks', cookies.admin)).body.length, 3);
    assert.equal((await request(`/api/tasks?committeeId=${otherCommitteeId}`, cookies.member)).status, 404);
    assert.equal((await request('/api/tasks?q=afi%C5%9F', cookies.member)).body.length, 1);
    assert.equal((await request('/api/tasks?status=done', cookies.member)).body.length, 0);
  });

  test('üye yalnız kendi görevinin içeriğini düzenler; sürüm çakışması güncel kartı döndürür', async () => {
    const current = (await request(`/api/tasks?committeeId=${committeeId}`, cookies.member)).body.find((task: { id: string }) => task.id === ids.memberTask);
    assert.equal((await request(`/api/tasks/${ids.memberTask}`, cookies.member, 'PATCH', { version: current.version, dueAt: null })).status, 403);
    assert.equal((await request(`/api/tasks/${ids.otherTask}`, cookies.member, 'PATCH', { version: 1, title: 'Ele geçir' })).status, 403);
    const edited = await request(`/api/tasks/${ids.memberTask}`, cookies.member, 'PATCH', { version: current.version, title: 'Afiş taslağı v2' });
    assert.equal(edited.status, 200); assert.equal(edited.body.version, current.version + 1);
    const stale = await request(`/api/tasks/${ids.memberTask}`, cookies.lead, 'PATCH', { version: current.version, priority: 'high' });
    assert.equal(stale.status, 409); assert.equal(stale.body.current.title, 'Afiş taslağı v2');
  });

  test('Kanban geçişleri inceleme onayı, ret ve yeniden açma kurallarını izler', async () => {
    const move = (cookie: string, status: string, version: number, reason?: string) => request(`/api/tasks/${ids.memberTask}/transition`, cookie, 'POST', { status, version, ...(reason ? { reason } : {}) });
    let version = 2;
    const skip = await move(cookies.member, 'done', version);
    assert.equal(skip.status, 403);
    const directDone = await move(cookies.lead, 'done', version);
    assert.equal(directDone.status, 409); assert.equal(directDone.body.error.code, 'INVALID_TRANSITION');
    let result = await move(cookies.member, 'in_progress', version);
    assert.equal(result.status, 200); version = result.body.version;
    assert.equal((await move(cookies.member, 'in_progress', version)).body.version, version);
    result = await move(cookies.member, 'in_review', version); version = result.body.version;
    assert.equal(result.body.permissions.edit, false); assert.deepEqual(result.body.permissions.moves, ['in_progress']);
    assert.equal((await request(`/api/tasks/${ids.memberTask}`, cookies.member, 'PATCH', { version, title: 'Kilitli' })).body.error.code, 'TASK_LOCKED');
    assert.equal((await move(cookies.member, 'done', version)).status, 403);

    const rejectWithoutReason = await move(cookies.lead, 'in_progress', version);
    assert.equal(rejectWithoutReason.body.error.code, 'REASON_REQUIRED');
    result = await move(cookies.lead, 'in_progress', version, 'Logo eksik'); version = result.body.version;
    assert.equal(result.body.returned, 'rejected');
    result = await move(cookies.member, 'in_review', version); version = result.body.version;
    assert.equal(result.body.returned, null);
    result = await move(cookies.member, 'in_progress', version); version = result.body.version;
    result = await move(cookies.member, 'in_review', version); version = result.body.version;
    result = await move(cookies.lead, 'done', version);
    assert.equal(result.status, 200); assert.ok(result.body.completedAt); version = result.body.version;
    assert.equal((await move(cookies.member, 'in_progress', version, 'Tekrar')).status, 403);
    assert.equal((await move(cookies.lead, 'in_progress', version)).body.error.code, 'REASON_REQUIRED');
    result = await move(cookies.admin, 'in_progress', version, 'Tarih değişti');
    assert.equal(result.status, 200); assert.equal(result.body.completedAt, null); assert.equal(result.body.returned, 'reopened');

    const history = await request(`/api/tasks/${ids.memberTask}/reviews`, cookies.member);
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.submissions.map((item: { resolution: string; reason: string | null; resolvedBy: string | null }) => [item.resolution, item.reason, item.resolvedBy]),
      [['approved', null, 'lead'], ['withdrawn', null, 'member'], ['rejected', 'Logo eksik', 'lead']]);
    assert.equal(history.body.submissions[0].submittedBy, 'member');
    assert.deepEqual(history.body.reopens.map((item: { actorName: string; reason: string }) => [item.actorName, item.reason]), [['Başkan', 'Tarih değişti']]);
    assert.equal((await request(`/api/tasks/${ids.memberTask}/reviews`, cookies.outsider)).status, 404);

    const submissions = application.db.prepare('SELECT resolution, reason FROM task_submissions WHERE task_id = ? ORDER BY submitted_at, rowid').all(ids.memberTask);
    assert.deepEqual(submissions, [{ resolution: 'rejected', reason: 'Logo eksik' }, { resolution: 'withdrawn', reason: null }, { resolution: 'approved', reason: null }]);
    const reopen = application.db.prepare('SELECT reason, previous_submission_id IS NOT NULL AS linked FROM task_reopens WHERE task_id = ?').get(ids.memberTask);
    assert.deepEqual(reopen, { reason: 'Tarih değişti', linked: 1 });
  });

  test('başkan komitenin adını ve açıklamasını düzenler; ad tekil kalır', async () => {
    assert.equal((await request(`/api/committees/${committeeId}`, cookies.lead, 'PATCH', { name: 'Etkinlik Ekibi' })).status, 403);
    assert.equal((await request(`/api/committees/${committeeId}`, cookies.admin, 'PATCH', { name: 'medya' })).body.error.code, 'COMMITTEE_EXISTS');
    assert.equal((await request(`/api/committees/${committeeId}`, cookies.admin, 'PATCH', { name: '  ' })).status, 400);
    const renamed = await request(`/api/committees/${committeeId}`, cookies.admin, 'PATCH', { name: 'Etkinlik Ekibi', description: 'Buluşma ve konferanslar' });
    assert.equal(renamed.status, 200);
    assert.deepEqual([renamed.body.name, renamed.body.description], ['Etkinlik Ekibi', 'Buluşma ve konferanslar']);
    const board = (await request(`/api/tasks?committeeId=${committeeId}`, cookies.member)).body as Array<{ committeeName: string }>;
    assert.ok(board.length && board.every(task => task.committeeName === 'Etkinlik Ekibi'));
    assert.equal((await request(`/api/committees/${committeeId}`, cookies.admin, 'PATCH', { name: 'Etkinlik' })).status, 200);
  });

  test('açık görevi olan üye çıkarılamaz ve komite arşivlenemez', async () => {
    const removal = await request(`/api/committees/${committeeId}/members/${ids.other}`, cookies.admin, 'DELETE');
    assert.equal(removal.status, 409); assert.equal(removal.body.error.code, 'MEMBER_HAS_OPEN_TASKS');
    assert.equal((await request(`/api/committees/${committeeId}`, cookies.admin, 'PATCH', { archived: true })).body.error.code, 'COMMITTEE_HAS_OPEN_TASKS');
    const otherTasks = (await request(`/api/tasks?committeeId=${otherCommitteeId}`, cookies.admin)).body;
    let version = otherTasks[0].version;
    for (const status of ['in_review', 'done']) version = (await request(`/api/tasks/${otherTasks[0].id}/transition`, cookies.admin, 'POST', { status, version })).body.version;
    const archived = await request(`/api/committees/${otherCommitteeId}`, cookies.admin, 'PATCH', { archived: true });
    assert.equal(archived.status, 200); assert.ok(archived.body.archivedAt);
    assert.equal((await request('/api/committees', cookies.outsider)).body.length, 0);
    assert.equal((await request('/api/tasks', cookies.admin, 'POST', { committeeId: otherCommitteeId, title: 'Arşive' })).status, 409);
  });

  test('aynı görev birden fazla kişiye aynı anda açılabilir', async () => {
    const multi = await request('/api/tasks', cookies.lead, 'POST', {
      committeeId,
      title: 'Toplantı hazırlığı',
      description: 'Gündem maddelerini kontrol edin',
      assigneeIds: [ids.member, ids.other],
      priority: 'high',
    });
    assert.equal(multi.status, 201);
    assert.equal(multi.body.length, 2);
    assert.equal(multi.body[0].title, 'Toplantı hazırlığı');
    assert.equal(multi.body[1].title, 'Toplantı hazırlığı');
    assert.deepEqual(multi.body.map((t: { assigneeId: string }) => t.assigneeId).sort(), [ids.member, ids.other].sort());

    assert.equal((await request('/api/tasks', cookies.lead, 'POST', { committeeId, title: 'Boş', assigneeIds: [] })).status, 400);
    assert.equal((await request('/api/tasks', cookies.member, 'POST', { committeeId, title: 'Yetkisiz', assigneeIds: [ids.member, ids.other] })).status, 403);
  });
});
