import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../src/database.js';
import { startWorkspace } from './helpers.js';

/** A bare database with the Better Auth user table our foreign keys point to. */
function bare() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  return db;
}

describe('veri modeli ve migration sırası', () => {
  test("migration'lar sırayla bir kez uygulanır ve kaydedilir", () => {
    const db = bare();
    assert.deepEqual(migrate(db), ['001-identity', '002-committees-tasks', '003-task-details', '004-integrity', '005-web-push']);
    assert.deepEqual(migrate(db), []);
    const versions = (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: string }>).map(row => row.version);
    assert.deepEqual(versions, ['001-identity', '002-committees-tasks', '003-task-details', '004-integrity', '005-web-push']);
    db.close();
  });

  test("eski kurulum yalnız eksik migration'ları alır", () => {
    const db = bare();
    migrate(db);
    db.exec("DROP TRIGGER tasks_keep_completed; DELETE FROM schema_migrations WHERE version = '004-integrity'");
    assert.deepEqual(migrate(db), ['004-integrity']);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'tasks_keep_completed'").get());
    db.close();
  });
});

describe('veritabanı kısıtları', () => {
  let ws: Awaited<ReturnType<typeof startWorkspace>>;
  const tasks: Record<string, string> = {};

  before(async () => {
    ws = await startWorkspace('gdg-db-', ['lead', 'member']);
    const { request, cookies, ids } = ws;
    const committee = (await request('/api/committees', cookies.admin, 'POST', { name: 'Etkinlik' })).body.id;
    for (const [user, role] of [['lead', 'lead'], ['member', 'member']]) await request(`/api/committees/${committee}/members/${ids[user]}`, cookies.admin, 'PUT', { role });
    for (const key of ['done', 'other']) {
      let task = (await request('/api/tasks', cookies.member, 'POST', { committeeId: committee, title: key })).body;
      task = (await request(`/api/tasks/${task.id}/transition`, cookies.member, 'POST', { status: 'in_review', version: task.version })).body;
      if (key === 'done') await request(`/api/tasks/${task.id}/transition`, cookies.lead, 'POST', { status: 'done', version: task.version });
      tasks[key] = task.id;
    }
  });
  after(() => ws.stop());

  test('onaylanan teslim başka göreve ait olamaz', () => {
    const db = ws.application.db;
    const foreign = db.prepare('SELECT id FROM task_submissions WHERE task_id = ?').get(tasks.other) as { id: string };
    assert.throws(() => db.prepare('UPDATE tasks SET approved_submission_id = ? WHERE id = ?').run(foreign.id, tasks.done), /approved submission must belong to the task/);
    assert.throws(() => db.prepare("INSERT INTO task_reopens (id, task_id, previous_submission_id, actor_id, reason, created_at) VALUES ('r', ?, ?, ?, 'x', 'now')")
      .run(tasks.done, foreign.id, ws.ids.lead), /reopened submission must belong to the task/);
  });

  test('tamamlanan görev ve geçmişi olan kullanıcı silinemez', () => {
    const db = ws.application.db;
    assert.throws(() => db.prepare('DELETE FROM tasks WHERE id = ?').run(tasks.done), /completed tasks are archived/);
    assert.throws(() => db.prepare('DELETE FROM user WHERE id = ?').run(ws.ids.member), /FOREIGN KEY/);
    assert.throws(() => db.prepare("INSERT INTO committee_memberships (committee_id, user_id, role, created_at) SELECT committee_id, user_id, 'member', 'now' FROM committee_memberships LIMIT 1").run(), /UNIQUE/);
  });
});
