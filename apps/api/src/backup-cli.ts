// `npm run backup` / `node apps/api/dist/backup-cli.js [directory]`: safe online copy of the live database.
import { resolve } from 'node:path';
import { backupDatabase, backupDirectory, verifyBackup } from './maintenance.js';

const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/gdg.sqlite');
try {
  const path = await backupDatabase(databasePath, { directory: process.argv[2] ? resolve(process.argv[2]) : backupDirectory(databasePath) });
  verifyBackup(path);
  console.log(path);
} catch (error) {
  console.error(`Yedek alınamadı: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
