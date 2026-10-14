// `node apps/api/dist/restore-cli.js <backup> --yes`: run only while the service is stopped.
import { resolve } from 'node:path';
import { restoreDatabase } from './maintenance.js';

const [backup, confirm] = process.argv.slice(2);
if (!backup || confirm !== '--yes') {
  console.error('Kullanım: restore-cli <yedek.sqlite> --yes  (önce servisi durdurun; mevcut veritabanı before-restore yedeğine alınır)');
  process.exit(1);
}
const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/gdg.sqlite');
try {
  const result = await restoreDatabase(backup, databasePath);
  console.log(`Geri yüklendi: ${result.restored} (${result.versions.join(', ')})`);
  if (result.safety) console.log(`Önceki veritabanı: ${result.safety}`);
} catch (error) {
  console.error(`Geri yükleme yapılmadı: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
