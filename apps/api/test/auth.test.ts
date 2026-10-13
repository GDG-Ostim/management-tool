import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createApplication } from '../src/app.js';
import { bootstrap } from '../src/identity.js';
import type { Config } from '../src/config.js';
import type { PasswordMail } from '../src/mail.js';

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test portu alınamadı.');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

describe('kapalı kayıt ve davet akışı', () => {
  let directory: string;
  let origin: string;
  let application: Awaited<ReturnType<typeof createApplication>>;
  let server: Server;
  let passwordFile: string;
  let adminCookie = '';
  let failMail = false;
  const messages: PasswordMail[] = [];
  const admin = { email: 'baskan@example.com', password: 'Guclu-Baslangic-Sifresi-123!' };

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gdg-auth-'));
    passwordFile = join(directory, 'password.txt');
    await writeFile(passwordFile, admin.password);
    const port = await freePort(); origin = `http://127.0.0.1:${port}`;
    const config: Config = { appUrl: origin, secret: 'test-secret-that-is-at-least-32-characters-long', databasePath: join(directory, 'test.sqlite'), port, production: false };
    application = await createApplication(config, { async sendPasswordLink(message) { if (failMail) throw new Error('test mail failure'); messages.push(message); } });
    server = application.app.listen(port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    application.close();
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep + 'gdg-auth-')) throw new Error('Güvensiz test temizleme yolu');
    await rm(target, { recursive: true, force: true });
  });

  async function request(path: string, init: RequestInit = {}) {
    return fetch(`${origin}${path}`, { ...init, headers: { origin, ...(init.headers ?? {}) } });
  }

  async function login(email: string, password: string) {
    const response = await request('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }

  test('ilk başkanı yalnız bir kez oluşturur ve kapalı kaydı korur', async () => {
    assert.deepEqual(await bootstrap(application.auth, application.db, { email: admin.email, name: 'Başkan', passwordFile }), { created: true });
    assert.deepEqual(await bootstrap(application.auth, application.db, { email: admin.email, name: 'Başka Ad', passwordFile }), { created: false });
    const signUp = await request('/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Açık Kayıt', email: 'kayit@example.com', password: 'Kayit-Sifresi-123!' }) });
    assert.equal(signUp.status, 404);
    assert.equal((application.db.prepare('SELECT count(*) AS count FROM user').get() as { count: number }).count, 1);
  });

  test('başkan giriş yapar ve oturum profiline erişir', async () => {
    const { response, cookie } = await login(admin.email, admin.password);
    assert.equal(response.status, 200); assert.match(cookie, /^better-auth\.session_token=/);
    adminCookie = cookie;
    const me = await request('/api/me', { headers: { cookie } });
    assert.equal(me.status, 200);
    const userId = (await response.json()).user.id;
    assert.deepEqual(await me.json(), { id: userId, name: 'Başkan', email: admin.email, role: 'super_admin', onboardingCompletedAt: null });

    const invalidOnboarding = await request('/api/me/onboarding', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ completed: false }) });
    assert.equal(invalidOnboarding.status, 400);
    const completed = await request('/api/me/onboarding', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ completed: true }) });
    assert.equal(completed.status, 200);
    const completedAt = (await completed.json() as { onboardingCompletedAt: string }).onboardingCompletedAt;
    assert.ok(Date.parse(completedAt));
    const repeated = await request('/api/me/onboarding', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ completed: true }) });
    assert.deepEqual(await repeated.json(), { onboardingCompletedAt: completedAt });
    const refreshed = await request('/api/me', { headers: { cookie } });
    assert.equal((await refreshed.json() as { onboardingCompletedAt: string }).onboardingCompletedAt, completedAt);
  });

  test('başkan kullanıcı davet eder; bağlantı tek kullanımlıdır ve hesabı etkinleştirir', async () => {
    const created = await request('/api/users', { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Yeni Üye', email: 'uye@example.com' }) });
    assert.equal(created.status, 201); assert.equal((await created.json()).invitation, 'sent');
    assert.equal(messages.length, 1); assert.equal(messages[0].email, 'uye@example.com');
    const token = new URL(messages[0].url).pathname.split('/').at(-1)!;
    const reset = await request('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, newPassword: 'Yeni-Uye-Sifresi-123!' }) });
    assert.equal(reset.status, 200);
    const repeated = await request('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, newPassword: 'Baska-Uye-Sifresi-123!' }) });
    assert.equal(repeated.status, 400);
    const member = await login('uye@example.com', 'Yeni-Uye-Sifresi-123!');
    assert.equal(member.response.status, 200); assert.ok(member.cookie);
    const signedIn = await member.response.json() as { user: { id: string } };
    assert.equal((application.db.prepare('SELECT state FROM invitations WHERE user_id = ?').get(signedIn.user.id) as { state: string }).state, 'accepted');
  });

  test('mükerrer kullanıcı açmaz ve mail hatasında hesabı yeniden davete açık tutar', async () => {
    const duplicate = await request('/api/users', { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Tekrar', email: 'uye@example.com' }) });
    assert.equal(duplicate.status, 409);
    failMail = true;
    const failed = await request('/api/users', { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mail Hatası', email: 'mail@example.com' }) });
    assert.equal(failed.status, 201); assert.equal((await failed.json()).invitation, 'failed');
    const failedUser = application.db.prepare("SELECT u.id, i.state FROM user u JOIN invitations i ON i.user_id=u.id WHERE u.email='mail@example.com'").get() as { id: string; state: string };
    assert.equal(failedUser.state, 'failed');
    failMail = false;
    const retry = await request(`/api/users/${failedUser.id}/invite`, { method: 'POST', headers: { cookie: adminCookie } });
    assert.equal(retry.status, 200); assert.equal((await retry.json()).invitation, 'sent');
  });

  test('CSRF origin kontrolü ve genel şifre yanıtı veri sızdırmaz', async () => {
    const blocked = await fetch(`${origin}/api/password-reset`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'uye@example.com' }) });
    assert.equal(blocked.status, 403);
    const unknown = await request('/api/password-reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yok@example.com' }) });
    const existing = await request('/api/password-reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'uye@example.com' }) });
    assert.equal(unknown.status, 202); assert.equal(existing.status, 202);
    assert.deepEqual(await unknown.json(), await existing.json());
  });
});
