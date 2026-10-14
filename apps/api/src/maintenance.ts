import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const backupDirectory = (databasePath: string) => join(dirname(resolve(databasePath)), 'backups');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * Copies the live database with SQLite's online backup API, so WAL content is included and
 * the running service can keep writing. Copying only the .sqlite file of a WAL database is not a backup.
 */
export async function backupDatabase(databasePath: string, options: { directory?: string; prefix?: string } = {}) {
  const directory = options.directory ?? backupDirectory(databasePath);
  mkdirSync(directory, { recursive: true });
  const target = join(directory, `${options.prefix ?? 'gdg'}-${stamp()}.sqlite`);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { await db.backup(target); } finally { db.close(); }
  // The copy inherits WAL mode; switch it to a rollback journal so a backup stays one self-contained file.
  const copy = new Database(target);
  try { copy.pragma('journal_mode = DELETE'); } finally { copy.close(); }
  return target;
}

/** Keeps the newest `keep` backups of one kind (`gdg`, `startup`, `before-restore`). */
export function pruneBackups(directory: string, keep: number, prefix: string) {
  if (!existsSync(directory)) return [];
  const files = readdirSync(directory).filter(name => name.startsWith(`${prefix}-`) && name.endsWith('.sqlite')).sort().reverse();
  const removed = files.slice(keep);
  for (const name of removed) rmSync(join(directory, name));
  return removed;
}

/** A backup must open, pass SQLite's integrity check and contain this application's schema. */
export function verifyBackup(path: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Yedek bozuk: ${String(integrity)}`);
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()) throw new Error('Dosya bu uygulamanın yedeği değil.');
    return (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: string }>).map(row => row.version);
  } finally { db.close(); }
}

/**
 * Replaces the database with a verified backup. The service must be stopped first; the current
 * database is backed up beside it so a wrong restore can be undone.
 */
export async function restoreDatabase(backupPath: string, databasePath: string) {
  const source = resolve(backupPath); const target = resolve(databasePath);
  if (source === target) throw new Error('Yedek ile veritabanı aynı dosya olamaz.');
  const versions = verifyBackup(source);
  const safety = existsSync(target) ? await backupDatabase(target, { prefix: 'before-restore' }) : null;
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${target}${suffix}`, { force: true });
  mkdirSync(dirname(target), { recursive: true });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try { await db.backup(target); } finally { db.close(); }
  return { restored: basename(source), versions, safety };
}
