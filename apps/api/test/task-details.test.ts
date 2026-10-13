import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorkspace } from './helpers.js';

describe('görev detayı: yorum, kontrol listesi, çıktı ve etiket', () => {
  let ws: Awaited<ReturnType<typeof startWorkspace>>;
  let committee = ''; let taskId = ''; let version = 0;
  const path = (suffix = '') => `/api/tasks/${taskId}${suffix}`;

  before(async () => {
    ws = await startWorkspace('gdg-details-', ['lead', 'member', 'other', 'outsider']);
    const { request, cookies, ids } = ws;
    committee = (await request('/api/committees', cookies.admin, 'POST', { name: 'Etkinlik' })).body.id;
    for (const [user, role] of [['lead', 'lead'], ['member', 'member'], ['other', 'member']]) {
      await request(`/api/committees/${committee}/members/${ids[user]}`, cookies.admin, 'PUT', { role });
    }
    const created = await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: 'Afiş' });
    taskId = created.body.id; version = created.body.version;
  });
  after(() => ws.stop());

  test('komiteyi okuyan herkes yorum yazar; yalnız kendi yorumunu değiştirir', async () => {
    const { request, cookies } = ws;
    assert.equal((await request(path('/comments'), cookies.outsider, 'POST', { body: 'Merhaba' })).status, 404);
    assert.equal((await request(path('/comments'), cookies.other, 'POST', { body: '   ' })).status, 400);
    const posted = await request(path('/comments'), cookies.other, 'POST', { body: 'Renkleri kontrol edelim.' });
    assert.equal(posted.status, 201);
    const comment = posted.body.comments[0];
    assert.deepEqual([comment.authorName, comment.mine], ['other', true]);
    assert.equal((await request(path(`/comments/${comment.id}`), cookies.member, 'PATCH', { body: 'Değişti' })).status, 403);
    assert.equal((await request(path(`/comments/${comment.id}`), cookies.lead, 'DELETE')).status, 403);
    const edited = await request(path(`/comments/${comment.id}`), cookies.other, 'PATCH', { body: 'Renkler tamam.' });
    assert.equal(edited.body.comments[0].body, 'Renkler tamam.');
    const seen = await request(path('/details'), cookies.member);
    assert.equal(seen.body.comments[0].mine, false);
  });

  test('kontrol listesi ve çıktılar görevin düzenleme kuralını izler', async () => {
    const { request, cookies } = ws;
    assert.equal((await request(path('/checklist'), cookies.other, 'POST', { text: 'Taslak' })).status, 403);
    let result = await request(path('/checklist'), cookies.member, 'POST', { text: 'Taslak' });
    assert.equal(result.status, 201);
    result = await request(path('/checklist'), cookies.lead, 'POST', { text: 'Baskı' });
    const [first, second] = result.body.checklist;
    assert.deepEqual([first.text, second.text], ['Taslak', 'Baskı']);
    result = await request(path(`/checklist/${first.id}`), cookies.member, 'PATCH', { checked: true });
    assert.equal(result.body.checklist[0].checked, true);
    assert.equal((await request(path(`/checklist/${first.id}`), cookies.member, 'PATCH', { checked: 'evet' })).status, 400);

    for (const url of ['javascript:alert(1)', 'ftp://ornek.com/a', 'https://kisi:sifre@ornek.com', 'bağlantı değil']) {
      assert.equal((await request(path('/links'), cookies.member, 'POST', { url })).body.error.code, 'INVALID_URL', url);
    }
    result = await request(path('/links'), cookies.member, 'POST', { url: 'https://ornek.com/afis.pdf', label: 'Son afiş' });
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.links.map((link: { url: string; label: string }) => [link.url, link.label]), [['https://ornek.com/afis.pdf', 'Son afiş']]);

    version = (await request(path('/transition'), cookies.member, 'POST', { status: 'in_review', version })).body.version;
    assert.equal((await request(path('/checklist'), cookies.member, 'POST', { text: 'Geç madde' })).body.error.code, 'TASK_LOCKED');
    assert.equal((await request(path(`/links/${result.body.links[0].id}`), cookies.member, 'DELETE')).body.error.code, 'TASK_LOCKED');
    assert.equal((await request(path('/comments'), cookies.member, 'POST', { body: 'İncelemede de yorum olur.' })).status, 201);
    version = (await request(path('/transition'), cookies.member, 'POST', { status: 'in_progress', version })).body.version;
    result = await request(path(`/checklist/${second.id}`), cookies.member, 'DELETE');
    assert.equal(result.body.checklist.length, 1);
  });

  test('etiketleri yalnız komite başkanı belirler; komite etiketleri yeniden kullanılır', async () => {
    const { request, cookies } = ws;
    assert.equal((await request(path('/labels'), cookies.member, 'PUT', { names: ['Tasarım'] })).status, 403);
    assert.equal((await request(path('/details'), cookies.member)).body.permissions.labels, false);
    let result = await request(path('/labels'), cookies.lead, 'PUT', { names: ['Tasarım', 'tasarım', 'Acil'] });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.labels, ['Acil', 'Tasarım']);
    result = await request(path('/labels'), cookies.lead, 'PUT', { names: ['Tasarım'] });
    assert.deepEqual([result.body.labels, result.body.committeeLabels], [['Tasarım'], ['Acil', 'Tasarım']]);
    assert.equal((await request(path('/labels'), cookies.lead, 'PUT', { names: Array.from({ length: 11 }, (_, index) => `E${index}`) })).status, 400);
  });

  test('çıktı bağlantıları rapor satırında görünür', async () => {
    const report = await ws.request('/api/reports/me', ws.cookies.member);
    const row = report.body.tasks.find((item: { id: string }) => item.id === taskId);
    assert.deepEqual(row.links, [{ url: 'https://ornek.com/afis.pdf', label: 'Son afiş' }]);
  });
});
