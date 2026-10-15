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

/**
 * Ordered schema migrations. Each runs once in its own transaction and is recorded in schema_migrations;
 * never edit an applied migration, append a new one. Better Auth creates its own tables (user, session, …) first.
 */
const migrations: Array<{ version: string; sql: string }> = [
  { version: '001-identity', sql: `
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
  ` },
  { version: '002-committees-tasks', sql: `
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
  ` },
  { version: '003-task-details', sql: `
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), author_id TEXT NOT NULL REFERENCES user(id),
        body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_comments_task ON task_comments(task_id, created_at);
      CREATE TABLE IF NOT EXISTS task_checklist_items (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), text TEXT NOT NULL,
        checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)), position INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_checklist_task ON task_checklist_items(task_id, position);
      CREATE TABLE IF NOT EXISTS task_links (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), url TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_links_task ON task_links(task_id, created_at);
      CREATE TABLE IF NOT EXISTS labels (
        id TEXT PRIMARY KEY, committee_id TEXT NOT NULL REFERENCES committees(id), name TEXT NOT NULL COLLATE NOCASE,
        UNIQUE (committee_id, name)
      );
      CREATE TABLE IF NOT EXISTS task_labels (
        task_id TEXT NOT NULL REFERENCES tasks(id), label_id TEXT NOT NULL REFERENCES labels(id), PRIMARY KEY (task_id, label_id)
      );
  ` },
  { version: '004-integrity', sql: `
      CREATE INDEX IF NOT EXISTS task_submissions_task ON task_submissions(task_id, submitted_at);
      CREATE INDEX IF NOT EXISTS task_labels_label ON task_labels(label_id);
      CREATE TRIGGER IF NOT EXISTS tasks_approved_submission_same_task
      BEFORE UPDATE OF approved_submission_id ON tasks
      WHEN NEW.approved_submission_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM task_submissions WHERE id = NEW.approved_submission_id AND task_id = NEW.id)
      BEGIN SELECT RAISE(ABORT, 'approved submission must belong to the task'); END;
      CREATE TRIGGER IF NOT EXISTS task_reopens_submission_same_task
      BEFORE INSERT ON task_reopens
      WHEN NEW.previous_submission_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM task_submissions WHERE id = NEW.previous_submission_id AND task_id = NEW.task_id)
      BEGIN SELECT RAISE(ABORT, 'reopened submission must belong to the task'); END;
      CREATE TRIGGER IF NOT EXISTS tasks_keep_completed
      BEFORE DELETE ON tasks WHEN OLD.status = 'done' OR OLD.completed_at IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'completed tasks are archived, not deleted'); END;
  ` },
  { version: '005-web-push', sql: `
      CREATE TABLE notification_preferences (
        user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
        assignment INTEGER NOT NULL DEFAULT 1 CHECK (assignment IN (0,1)),
        review INTEGER NOT NULL DEFAULT 1 CHECK (review IN (0,1)),
        decision INTEGER NOT NULL DEFAULT 1 CHECK (decision IN (0,1))
      );
      CREATE TABLE push_subscriptions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
        created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
      );
      CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
      CREATE INDEX push_subscriptions_session ON push_subscriptions(session_id);
      CREATE TABLE notification_outbox (
        id TEXT PRIMARY KEY, event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id),
        kind TEXT NOT NULL CHECK (kind IN ('assignment','review','decision','test')),
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed','skipped')),
        attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease_until INTEGER,
        created_at INTEGER NOT NULL, completed_at INTEGER,
        UNIQUE (event_id, subscription_id)
      );
      CREATE INDEX notification_outbox_due ON notification_outbox(state, next_at);
  ` },
  // SQLite cannot widen a CHECK constraint in place, so the outbox is rebuilt with its rows.
  { version: '006-deadline-reminders', sql: `
      ALTER TABLE notification_preferences ADD COLUMN reminder INTEGER NOT NULL DEFAULT 1 CHECK (reminder IN (0,1));
      CREATE TABLE notification_outbox_next (
        id TEXT PRIMARY KEY, event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id),
        kind TEXT NOT NULL CHECK (kind IN ('assignment','review','decision','reminder','test')),
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed','skipped')),
        attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease_until INTEGER,
        created_at INTEGER NOT NULL, completed_at INTEGER,
        UNIQUE (event_id, subscription_id)
      );
      INSERT INTO notification_outbox_next SELECT id, event_id, subscription_id, task_id, kind, state, attempts, next_at, lease_until, created_at, completed_at FROM notification_outbox;
      DROP TABLE notification_outbox;
      ALTER TABLE notification_outbox_next RENAME TO notification_outbox;
      CREATE INDEX notification_outbox_due ON notification_outbox(state, next_at);
  ` },
];

/** Applies pending migrations in order and returns the versions it applied. */
export function migrate(db: Database.Database): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: string }>).map(row => row.version));
  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString());
    })();
    ran.push(migration.version);
  }
  return ran;
}

export function canSignIn(db: Database.Database, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM user_profiles p JOIN invitations i ON i.user_id = p.user_id
    WHERE p.user_id = ? AND p.active = 1 AND i.state = 'accepted'`).get(userId);
}
