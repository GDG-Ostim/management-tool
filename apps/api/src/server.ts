import { createApplication } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const application = await createApplication(config);
const server = application.app.listen(config.port, '127.0.0.1', () => {
  console.log(`API hazır: http://127.0.0.1:${config.port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => { application.close(); process.exit(0); }));
}
