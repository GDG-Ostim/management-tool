import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspace } from './helpers.js';

describe('komite bazlı yetkiler', () => {
  let ws: Awaited<ReturnType<typeof startWorkspace>>;
  let events = ''; let media = '';
  const create = (cookie: string, committeeId: string, assignee: string) =>
    ws.request('/api/tasks', cookie, 'POST', { committeeId, title: 'Görev', assigneeId: ws.ids[assignee] });

  before(async () => {
    ws = await startWorkspace('gdg-permissions-', ['lead', 'member', 'outsider', 'leaver']);
    const { request, cookies, ids } = ws;
    events = (await request('/api/committees', cookies.admin, 'POST', { name: 'Etkinlik' })).body.id;
    media = (await request('/api/committees', cookies.admin, 'POST', { name: 'Medya' })).body.id;
    // `lead` leads Etkinlik but is a plain member of Medya.
    for (const [committee, user, role] of [[events, 'lead', 'lead'], [events, 'member', 'member'], [media, 'lead', 'member'], [media, 'member', 'member'], [media, 'outsider', 'lead']]) {
      await request(`/api/committees/${committee}/members/${ids[user]}`, cookies.admin, 'PUT', { role });
    }
  });
  after(() => ws.stop());

  test('aynı kişi bir komitede başkan, diğerinde üye olarak ayrı yetki alır', async () => {
    const { cookies } = ws;
    assert.equal((await create(cookies.lead, events, 'member')).status, 201);
    assert.equal((await create(cookies.lead, media, 'member')).status, 403);

    const mediaTask = (await create(cookies.member, media, 'member')).body;
    const submitted = (await ws.request(`/api/tasks/${mediaTask.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: mediaTask.version })).body;
    assert.deepEqual(submitted.permissions.moves, ['in_progress']);
    const asLead = (await ws.request('/api/tasks', cookies.lead)).body.find((task: { id: string }) => task.id === mediaTask.id);
    assert.equal(asLead.permissions.manage, false);
    assert.equal((await ws.request(`/api/tasks/${mediaTask.id}/transition`, cookies.lead, 'POST', { status: 'done', version: submitted.version })).status, 403);
    assert.equal((await ws.request(`/api/tasks/${mediaTask.id}/transition`, cookies.outsider, 'POST', { status: 'done', version: submitted.version })).status, 200);

    assert.equal((await ws.request(`/api/reports/committees/${events}`, cookies.lead)).status, 200);
    assert.equal((await ws.request(`/api/reports/committees/${media}`, cookies.lead)).status, 403);
  });

  test('görünmeyen kaynak 404, görülen kaynakta yetkisiz işlem 403 döner', async () => {
    const { cookies, ids } = ws;
    assert.equal((await ws.request(`/api/committees/${events}`, cookies.outsider)).status, 404);
    assert.equal((await ws.request(`/api/tasks?committeeId=${events}`, cookies.outsider)).status, 404);
    assert.equal((await ws.request(`/api/committees/${events}`, cookies.member)).status, 200);
    assert.equal((await ws.request(`/api/committees/${events}`, cookies.member, 'PATCH', { name: 'Yeni' })).status, 403);
    assert.equal((await ws.request(`/api/committees/${events}/members/${ids.outsider}`, cookies.lead, 'PUT', { role: 'member' })).status, 403);
    assert.equal((await ws.request('/api/users', cookies.lead)).status, 403);
    assert.equal((await ws.request('/api/reports/overview', cookies.lead)).status, 403);
  });

  test('komite rolü değişince sonraki istek güncel yetkiyle çalışır', async () => {
    const { cookies, ids } = ws;
    await ws.request(`/api/committees/${events}/members/${ids.lead}`, cookies.admin, 'PUT', { role: 'member' });
    assert.equal((await create(cookies.lead, events, 'member')).status, 403);
    assert.equal((await ws.request('/api/me', cookies.lead)).body.leadsCommittee, false);
    assert.equal((await ws.request(`/api/reports/committees/${events}`, cookies.lead)).status, 403);
    await ws.request(`/api/committees/${events}/members/${ids.lead}`, cookies.admin, 'PUT', { role: 'lead' });
    assert.equal((await create(cookies.lead, events, 'member')).status, 201);
  });

  test('pasif hesap oturumunu, şifre bağlantısını ve atanabilirliğini kaybeder', async () => {
    const { cookies, ids } = ws;
    await ws.request(`/api/committees/${events}/members/${ids.leaver}`, cookies.admin, 'PUT', { role: 'member' });
    assert.equal((await ws.request(`/api/users/${ids.leaver}`, cookies.admin, 'PATCH', { active: false })).status, 200);
    assert.equal((await ws.request('/api/me', cookies.leaver)).status, 401);
    assert.equal((await create(cookies.lead, events, 'leaver')).body.error.code, 'INVALID_ASSIGNEE');
    assert.equal((await ws.request(`/api/committees/${media}/members/${ids.leaver}`, cookies.admin, 'PUT', { role: 'member' })).body.error.code, 'USER_INACTIVE');

    const sent = ws.messages.length;
    const reset = await ws.request('/api/password-reset', '', 'POST', { email: 'leaver@example.com' });
    assert.equal(reset.status, 202);
    await new Promise(done => setTimeout(done, 200));
    assert.equal(ws.messages.length, sent);
    assert.equal((await ws.request(`/api/users/${ids.leaver}/invite`, cookies.admin, 'POST')).body.error.code, 'NOT_INVITABLE');
  });
});
