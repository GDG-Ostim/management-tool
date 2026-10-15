import { createApplication } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const application = await createApplication(config);
application.notifications.start();
const server = application.app.listen(config.port, config.host, () => {
  console.log(`API hazır: http://${config.host}:${config.port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => { application.close(); process.exit(0); }));
}
