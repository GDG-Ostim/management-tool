import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspace } from './helpers.js';

test('kişi e-postaları mevcut komite ve rapor yetki sınırlarını izler', async () => {
  const ws = await startWorkspace('gdg-contact-', ['lead', 'member', 'outsider']);
  const { request, cookies, ids } = ws;
  try {
    const committee = (await request('/api/committees', cookies.admin, 'POST', { name: 'İletişim' })).body.id;
    for (const [person, role] of [['lead', 'lead'], ['member', 'member']]) {
      await request(`/api/committees/${committee}/members/${ids[person]}`, cookies.admin, 'PUT', { role });
    }
    const task = (await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'İletişim testi' })).body;
    assert.equal(task.assigneeEmail, 'member@example.com');
    const members = (await request(`/api/committees/${committee}`, cookies.member)).body.members;
    assert.equal(members.find((p: { id: string }) => p.id === ids.lead).email, 'lead@example.com');
    const details = (await request(`/api/tasks/${task.id}/comments`, cookies.lead, 'POST', { body: 'Kontrol edildi' })).body;
    assert.equal(details.comments[0].authorEmail, 'lead@example.com');
    const submitted = (await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version })).body;
    await request(`/api/tasks/${task.id}/transition`, cookies.lead, 'POST', { status: 'done', version: submitted.version });
    const history = (await request(`/api/tasks/${task.id}/reviews`, cookies.member)).body;
    assert.equal(history.submissions[0].submittedByEmail, 'member@example.com');
    assert.equal(history.submissions[0].resolvedByEmail, 'lead@example.com');
    const report = (await request(`/api/reports/committees/${committee}`, cookies.lead)).body;
    assert.equal(report.tasks[0].personEmail, 'member@example.com');
    assert.equal(report.byPerson.find((p: { id: string }) => p.id === ids.member).email, 'member@example.com');
    assert.equal((await request(`/api/reports/users/${ids.member}`, cookies.lead)).body.person.email, 'member@example.com');
    assert.equal((await request('/api/reports/overview', cookies.admin)).body.byPerson[0].email, 'member@example.com');
    assert.deepEqual((await request('/api/tasks', cookies.outsider)).body, []);
    assert.equal((await request('/api/tasks', '')).status, 401);
    for (const path of [`/api/committees/${committee}`, `/api/tasks/${task.id}/details`, `/api/tasks/${task.id}/reviews`, `/api/reports/users/${ids.member}`, `/api/reports/committees/${committee}`]) {
      const denied = await request(path, cookies.outsider);
      assert.equal(denied.status, 404, path);
      assert.ok(!JSON.stringify(denied.body).includes('@example.com'));
      assert.equal((await request(path, '')).status, 401, path);
    }
  } finally { await ws.stop(); }
});
