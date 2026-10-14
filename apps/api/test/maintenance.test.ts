import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, openDatabase } from '../src/database.js';
import { backupDatabase, backupDirectory, pruneBackups, restoreDatabase, verifyBackup } from '../src/maintenance.js';

const committees = (path: string) => {
  const db = new Database(path, { readonly: true });
  try { return (db.prepare('SELECT name FROM committees ORDER BY name').all() as Array<{ name: string }>).map(row => row.name); } finally { db.close(); }
};

describe('yedekleme ve geri yükleme', () => {
  let directory = ''; let databasePath = ''; let live: Database.Database;
  const addCommittee = (name: string) => live.prepare("INSERT INTO committees (id, name, created_at) VALUES (?, ?, 'now')").run(name, name);

  before(() => {
    directory = mkdtempSync(join(tmpdir(), 'gdg-maintenance-'));
    databasePath = join(directory, 'data', 'gdg.sqlite');
    live = openDatabase(databasePath);
    live.exec('CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    migrate(live);
    live.pragma('wal_autocheckpoint = 0');
  });
  after(() => { live.close(); rmSync(directory, { recursive: true, force: true }); });

  test('çalışan veritabanının WAL içindeki son yazısı yedeğe girer', async () => {
    addCommittee('Etkinlik');
    assert.ok(existsSync(`${databasePath}-wal`));
    const path = await backupDatabase(databasePath);
    assert.ok(path.startsWith(backupDirectory(databasePath)));
    assert.deepEqual(committees(path), ['Etkinlik']);
    assert.ok(verifyBackup(path).includes('004-integrity'));
    // A backup is one file: reading it leaves no WAL/SHM companions behind.
    assert.equal(existsSync(`${path}-wal`) || existsSync(`${path}-shm`), false);
  });

  test('başka dosyalar yedek sayılmaz', () => {
    const foreign = join(directory, 'foreign.sqlite');
    const other = new Database(foreign); other.exec('CREATE TABLE notes (id INTEGER)'); other.close();
    assert.throws(() => verifyBackup(foreign), /bu uygulamanın yedeği değil/);
    const text = join(directory, 'text.sqlite');
    writeFileSync(text, 'yedek değil');
    assert.throws(() => verifyBackup(text));
  });

  test('geri yükleme önceki duruma döner ve mevcut veritabanını ayrıca saklar', async () => {
    const backup = await backupDatabase(databasePath);
    addCommittee('Medya');
    live.close();
    const result = await restoreDatabase(backup, databasePath);
    // The old WAL (holding "Medya") must not survive next to the restored file.
    assert.equal(existsSync(`${databasePath}-wal`), false);
    assert.deepEqual(committees(databasePath), ['Etkinlik']);
    assert.ok(result.safety);
    assert.deepEqual(committees(result.safety!), ['Etkinlik', 'Medya']);
    await assert.rejects(() => restoreDatabase(join(directory, 'yok.sqlite'), databasePath));
    live = openDatabase(databasePath);
  });

  test('eski yedekler türüne göre temizlenir', async () => {
    const folder = join(directory, 'prune');
    for (let index = 0; index < 4; index++) {
      await backupDatabase(databasePath, { directory: folder, prefix: 'startup' });
      await new Promise(done => setTimeout(done, 5));
    }
    await backupDatabase(databasePath, { directory: folder });
    assert.equal(pruneBackups(folder, 2, 'startup').length, 2);
    const left = readdirSync(folder);
    assert.equal(left.filter(name => name.startsWith('startup-')).length, 2);
    assert.equal(left.filter(name => name.startsWith('gdg-')).length, 1);
  });
});
