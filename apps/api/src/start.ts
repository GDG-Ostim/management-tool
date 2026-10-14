// Production entry point: startup backup → migrations → one-time first president → HTTP server.
import { existsSync } from 'node:fs';
import { createApplication } from './app.js';
import { loadConfig } from './config.js';
import { bootstrap } from './identity.js';
import { backupDatabase, backupDirectory, pruneBackups } from './maintenance.js';

const config = loadConfig();

// Every start may migrate, so an existing database is copied first; the last ten startup copies are kept.
if (existsSync(config.databasePath)) {
  const path = await backupDatabase(config.databasePath, { prefix: 'startup' });
  pruneBackups(backupDirectory(config.databasePath), 10, 'startup');
  console.log(`Başlangıç yedeği alındı: ${path}`);
}

const application = await createApplication(config);

if (!application.db.prepare("SELECT 1 FROM app_settings WHERE key = 'bootstrap_completed'").get()) {
  const passwordFile = process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE;
  if (passwordFile && existsSync(passwordFile)) {
    try {
      await bootstrap(application.auth, application.db, { email: process.env.BOOTSTRAP_ADMIN_EMAIL, name: process.env.BOOTSTRAP_ADMIN_NAME, passwordFile });
      console.log('İlk başkan oluşturuldu. Şifre dosyasını ve secret bağlantısını kurulumdan kaldırabilirsiniz.');
    } catch (error) {
      console.error(error instanceof Error && error.name === 'Error' ? error.message : 'Başkan oluşturulamadı; kurulum bilgilerini kontrol edin.');
      application.close(); process.exit(1);
    }
  } else {
    console.warn('Henüz başkan yok: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME ve şifre dosyasıyla yeniden başlatın.');
  }
}

const server = application.app.listen(config.port, config.host, () => console.log(`Uygulama hazır: ${config.host}:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => { application.close(); process.exit(0); }));
}
