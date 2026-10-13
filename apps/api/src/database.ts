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

export function migrateWork(db: Database.Database) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS committees (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT NOT NULL DEFAULT '',
        archived_at TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS committee_memberships (
        committee_id TEXT NOT NULL REFERENCES committees(id),
        user_id TEXT NOT NULL REFERENCES user(id),
        role TEXT NOT NULL CHECK (role IN ('lead','member')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (committee_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS committee_memberships_user ON committee_memberships(user_id);
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        committee_id TEXT NOT NULL REFERENCES committees(id),
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        assignee_id TEXT NOT NULL REFERENCES user(id),
        created_by TEXT NOT NULL REFERENCES user(id),
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','in_review','done')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
        due_at TEXT, version INTEGER NOT NULL DEFAULT 1, archived_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        completed_at TEXT, completed_by TEXT REFERENCES user(id), approved_submission_id TEXT
      );
      CREATE INDEX IF NOT EXISTS tasks_committee_status ON tasks(committee_id, status);
      CREATE INDEX IF NOT EXISTS tasks_assignee_status ON tasks(assignee_id, status);
      CREATE INDEX IF NOT EXISTS tasks_due ON tasks(due_at);
      CREATE TABLE IF NOT EXISTS task_submissions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        submitted_at TEXT NOT NULL, submitted_by TEXT NOT NULL REFERENCES user(id),
        assignee_id_snapshot TEXT NOT NULL REFERENCES user(id), due_at_snapshot TEXT,
        resolution TEXT NOT NULL DEFAULT 'pending' CHECK (resolution IN ('pending','approved','rejected','withdrawn')),
        resolved_at TEXT, resolved_by TEXT REFERENCES user(id), reason TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS task_submissions_one_pending ON task_submissions(task_id) WHERE resolution = 'pending';
      CREATE TABLE IF NOT EXISTS task_reopens (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        previous_submission_id TEXT REFERENCES task_submissions(id),
        actor_id TEXT NOT NULL REFERENCES user(id), reason TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_reopens_task ON task_reopens(task_id);
    `);
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?, ?)').run('002-committees-tasks', new Date().toISOString());
  })();
}

export function canSignIn(db: Database.Database, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM user_profiles p JOIN invitations i ON i.user_id = p.user_id
    WHERE p.user_id = ? AND p.active = 1 AND i.state = 'accepted'`).get(userId);
}
