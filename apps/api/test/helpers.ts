import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { createApplication } from '../src/app.js';
import { bootstrap } from '../src/identity.js';
import type { PasswordMail } from '../src/mail.js';
import type { Config } from '../src/config.js';
import type { PushSender } from '../src/notifications.js';

async function freePort() {
  const probe = createServer();
  await new Promise<void>(done => probe.listen(0, '127.0.0.1', done));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Test portu alınamadı.');
  await new Promise<void>((done, fail) => probe.close(error => error ? fail(error) : done()));
  return address.port;
}

/** Starts an isolated app with a chief and accepted users signed in through the server API. */
export async function startWorkspace(prefix: string, people: string[], push?: { config: NonNullable<Config['push']>; send: PushSender }) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const passwordFile = join(directory, 'password.txt');
  await writeFile(passwordFile, 'Guclu-Baslangic-Sifresi-123!');
  const port = await freePort(); const origin = `http://127.0.0.1:${port}`;
  const messages: PasswordMail[] = [];
  const application = await createApplication({ appUrl: origin, secret: 'test-secret-that-is-at-least-32-characters-long', databasePath: join(directory, 'test.sqlite'), port, host: '127.0.0.1', production: false, push: push?.config },
    { async sendPasswordLink(message) { messages.push(message); } }, push?.send);
  const server = application.app.listen(port, '127.0.0.1');
  await new Promise<void>((done, fail) => { server.once('listening', done); server.once('error', fail); });

  async function request(path: string, cookie: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${origin}${path}`, { method, headers: { origin, cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  }
  const signIn = async (email: string, password: string) =>
    (await application.auth.api.signInEmail({ body: { email, password }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0];

  await bootstrap(application.auth, application.db, { email: 'baskan@example.com', name: 'Başkan', passwordFile });
  const cookies: Record<string, string> = { admin: await signIn('baskan@example.com', 'Guclu-Baslangic-Sifresi-123!') };
  const ids: Record<string, string> = { admin: (application.db.prepare('SELECT id FROM user WHERE email = ?').get('baskan@example.com') as { id: string }).id };
  for (const key of people) {
    const created = await request('/api/users', cookies.admin, 'POST', { name: key, email: `${key}@example.com` });
    ids[key] = created.body.id;
    const token = new URL(messages.at(-1)!.url).pathname.split('/').at(-1)!;
    await application.auth.api.resetPassword({ body: { token, newPassword: `${key}-Sifresi-12345` } });
    cookies[key] = await signIn(`${key}@example.com`, `${key}-Sifresi-12345`);
  }

  async function stop() {
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
    application.close();
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep + prefix)) throw new Error('Güvensiz test temizleme yolu');
    await rm(target, { recursive: true, force: true });
  }
  return { application, request, cookies, ids, messages, stop };
}
