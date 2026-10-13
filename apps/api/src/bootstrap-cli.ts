import { createApplication } from './app.js';
import { loadConfig } from './config.js';
import { bootstrap } from './identity.js';

const application = await createApplication(loadConfig());
try {
  const result = await bootstrap(application.auth, application.db, {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL, name: process.env.BOOTSTRAP_ADMIN_NAME,
    passwordFile: process.env.BOOTSTRAP_ADMIN_PASSWORD_FILE,
  });
  console.log(result.created ? 'İlk başkan oluşturuldu. Şifre dosyasını kurulumdan kaldırabilirsiniz.' : 'Kurulum daha önce tamamlanmış; hesap ve şifre değiştirilmedi.');
} catch (error) {
  // Configuration errors are actionable; provider/auth failures may carry PII.
  console.error(error instanceof Error && error.name === 'Error' ? error.message : 'Başkan oluşturulamadı; kurulum bilgilerini kontrol edin.');
  process.exitCode = 1;
} finally { application.close(); }
