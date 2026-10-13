import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { timeout: 5000 });
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

export function migrateIdentity(db: Database.Database) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        onboarding_completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS invitations (
        user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK (state IN ('pending','sent','failed','accepted')),
        last_attempt_at TEXT, sent_at TEXT, accepted_at TEXT
      );
    `);
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?, ?)').run('001-identity', new Date().toISOString());
  })();
}

export function canSignIn(db: Database.Database, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM user_profiles p JOIN invitations i ON i.user_id = p.user_id
    WHERE p.user_id = ? AND p.active = 1 AND i.state = 'accepted'`).get(userId);
}
