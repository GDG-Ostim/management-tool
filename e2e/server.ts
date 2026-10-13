// End-to-end test server: the real application on a temporary database, the built web app on the same origin,
// and an in-memory mail adapter whose last password link per address is readable at /__e2e/mail.
import express from 'express';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication } from '../apps/api/src/app.js';
import { bootstrap } from '../apps/api/src/identity.js';
import { admin } from './accounts.js';

const port = Number(process.env.E2E_PORT ?? 4310);
const origin = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), 'gdg-e2e-'));
const passwordFile = join(directory, 'password.txt');
await writeFile(passwordFile, admin.password);

const mails = new Map<string, string>();
const application = await createApplication(
  { appUrl: origin, secret: 'e2e-secret-that-is-at-least-32-characters', databasePath: join(directory, 'e2e.sqlite'), port, production: false },
  { async sendPasswordLink(message) { mails.set(message.email.toLowerCase(), message.url); } },
);
await bootstrap(application.auth, application.db, { email: admin.email, name: admin.name, passwordFile });

const server = express();
server.get('/__e2e/mail', (req, res) => {
  const url = mails.get(String(req.query.email).toLowerCase());
  if (url) res.json({ url }); else res.status(404).json({ error: 'no mail' });
});
server.use(application.app);
server.use(express.static(resolve('apps/web/dist')));
server.get('/{*splat}', (_req, res) => res.sendFile(resolve('apps/web/dist/index.html')));
const listener = server.listen(port, '127.0.0.1', () => console.log(`e2e server ${origin}`));

async function stop() {
  listener.close(); application.close();
  await rm(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
