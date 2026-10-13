import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { committeeAccess, plainObject, type Actor } from './access.js';
import { HttpError } from './errors.js';

const limits = { checklist: 50, links: 20, labels: 10 };

type TaskRef = { id: string; committeeId: string; assigneeId: string; status: string };

function text(value: unknown, field: string, max: number, required = true) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, 'INVALID_DETAIL', `${field} ${required ? '1–' : 'en çok '}${max} karakter olmalı.`);
  return value.trim();
}

/** Only plain http(s) addresses without embedded credentials; the server never fetches them. */
function outputUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) throw new HttpError(400, 'INVALID_URL', 'Bağlantı en çok 2000 karakter olmalı.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new HttpError(400, 'INVALID_URL', 'Geçerli bir bağlantı gir (https://…).'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new HttpError(400, 'INVALID_URL', 'Yalnız http veya https bağlantısı eklenebilir.');
  return url.href;
}

export function registerTaskDetailRoutes(app: Express, db: Database.Database, guards: { requireMember: RequestHandler }) {
  const { requireMember } = guards;

  /** Comments need read access; checklist and links follow the task's edit rule; labels are for managers. */
  const load = (actor: Actor, id: string) => {
    const task = db.prepare('SELECT id, committee_id AS committeeId, assignee_id AS assigneeId, status FROM tasks WHERE id = ? AND archived_at IS NULL').get(id) as TaskRef | undefined;
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Görev bulunamadı.');
    const access = committeeAccess(db, actor, task.committeeId);
    const locked = task.status === 'in_review' || task.status === 'done';
    const edit = !locked && (access.manage || task.assigneeId === actor.id);
    return { task, access, permissions: { edit, labels: edit && access.manage, comment: !access.archivedAt } };
  };
  const requireEdit = (permissions: { edit: boolean }, task: TaskRef) => {
    if (permissions.edit) return;
    if (task.status === 'in_review' || task.status === 'done') throw new HttpError(409, 'TASK_LOCKED', task.status === 'done' ? 'Tamamlanan görev değiştirilemez; önce yeniden açılmalı.' : 'İncelemedeki görev değiştirilemez; önce teslim geri çekilmeli.');
    throw new HttpError(403, 'FORBIDDEN', 'Bu görevi yalnız sorumlusu veya komite başkanı değiştirebilir.');
  };

  const details = (actor: Actor, id: string) => {
    const { task, access, permissions } = load(actor, id);
    const labels = (db.prepare('SELECT l.name FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = ? ORDER BY l.name COLLATE NOCASE').all(task.id) as Array<{ name: string }>).map(row => row.name);
    const checklist = (db.prepare('SELECT id, text, checked FROM task_checklist_items WHERE task_id = ? ORDER BY position, rowid').all(task.id) as Array<{ id: string; text: string; checked: number }>)
      .map(item => ({ ...item, checked: item.checked === 1 }));
    const links = db.prepare('SELECT id, url, label, created_at AS createdAt FROM task_links WHERE task_id = ? ORDER BY created_at, rowid').all(task.id);
    const comments = (db.prepare(`SELECT c.id, c.author_id AS authorId, u.name AS authorName, c.body, c.created_at AS createdAt, c.updated_at AS updatedAt
      FROM task_comments c JOIN user u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at, c.rowid`).all(task.id) as Array<{ authorId: string }>)
      .map(comment => ({ ...comment, mine: comment.authorId === actor.id }));
    const committeeLabels = permissions.labels
      ? (db.prepare('SELECT name FROM labels WHERE committee_id = ? ORDER BY name COLLATE NOCASE').all(access.id) as Array<{ name: string }>).map(row => row.name) : [];
    return { labels, checklist, links, comments, committeeLabels, permissions };
  };

  app.get('/api/tasks/:id/details', requireMember, (req, res) => {
    res.json(details(res.locals.user as Actor, String(req.params.id)));
  });

  app.post('/api/tasks/:id/comments', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['body']);
    const { task, permissions } = load(actor, String(req.params.id));
    if (!permissions.comment) throw new HttpError(409, 'COMMITTEE_ARCHIVED', 'Arşivlenmiş komitede yorum yazılamaz.');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO task_comments (id, task_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), task.id, actor.id, text(body.body, 'Yorum', 5000), now, now);
    res.status(201).json(details(actor, task.id));
  });

  const ownComment = (actor: Actor, taskId: string, commentId: string) => {
    const comment = db.prepare('SELECT author_id AS authorId FROM task_comments WHERE id = ? AND task_id = ?').get(commentId, taskId) as { authorId: string } | undefined;
    if (!comment) throw new HttpError(404, 'NOT_FOUND', 'Yorum bulunamadı.');
    if (comment.authorId !== actor.id) throw new HttpError(403, 'FORBIDDEN', 'Yalnız kendi yorumunu değiştirebilirsin.');
  };
  app.patch('/api/tasks/:id/comments/:commentId', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['body']);
    const { task } = load(actor, String(req.params.id));
    ownComment(actor, task.id, String(req.params.commentId));
    db.prepare('UPDATE task_comments SET body = ?, updated_at = ? WHERE id = ?').run(text(body.body, 'Yorum', 5000), new Date().toISOString(), String(req.params.commentId));
    res.json(details(actor, task.id));
  });
  app.delete('/api/tasks/:id/comments/:commentId', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const { task } = load(actor, String(req.params.id));
    ownComment(actor, task.id, String(req.params.commentId));
    db.prepare('DELETE FROM task_comments WHERE id = ?').run(String(req.params.commentId));
    res.json(details(actor, task.id));
  });

  app.post('/api/tasks/:id/checklist', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['text']);
    const value = text(body.text, 'Madde', 300)!;
    db.transaction(() => {
      const { task, permissions } = load(actor, String(req.params.id));
      requireEdit(permissions, task);
      const { count, last } = db.prepare('SELECT count(*) AS count, coalesce(max(position), 0) AS last FROM task_checklist_items WHERE task_id = ?').get(task.id) as { count: number; last: number };
      if (count >= limits.checklist) throw new HttpError(409, 'LIMIT_REACHED', `Kontrol listesi en çok ${limits.checklist} madde olabilir.`);
      db.prepare('INSERT INTO task_checklist_items (id, task_id, text, checked, position) VALUES (?, ?, ?, 0, ?)').run(randomUUID(), task.id, value, last + 1);
    })();
    res.status(201).json(details(actor, String(req.params.id)));
  });

  const checklistItem = (taskId: string, itemId: string) => {
    if (!db.prepare('SELECT 1 FROM task_checklist_items WHERE id = ? AND task_id = ?').get(itemId, taskId)) throw new HttpError(404, 'NOT_FOUND', 'Madde bulunamadı.');
  };
  app.patch('/api/tasks/:id/checklist/:itemId', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['text', 'checked']);
    if (body.checked !== undefined && typeof body.checked !== 'boolean') throw new HttpError(400, 'INVALID_DETAIL', 'İşaret durumu geçersiz.');
    const value = text(body.text, 'Madde', 300, false);
    const { task, permissions } = load(actor, String(req.params.id));
    requireEdit(permissions, task);
    checklistItem(task.id, String(req.params.itemId));
    db.prepare('UPDATE task_checklist_items SET text = coalesce(?, text), checked = coalesce(?, checked) WHERE id = ?')
      .run(value ?? null, body.checked === undefined ? null : Number(body.checked), String(req.params.itemId));
    res.json(details(actor, task.id));
  });
  app.delete('/api/tasks/:id/checklist/:itemId', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const { task, permissions } = load(actor, String(req.params.id));
    requireEdit(permissions, task);
    checklistItem(task.id, String(req.params.itemId));
    db.prepare('DELETE FROM task_checklist_items WHERE id = ?').run(String(req.params.itemId));
    res.json(details(actor, task.id));
  });

  app.post('/api/tasks/:id/links', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['url', 'label']);
    const url = outputUrl(body.url); const label = text(body.label, 'Bağlantı adı', 120, false) ?? '';
    db.transaction(() => {
      const { task, permissions } = load(actor, String(req.params.id));
      requireEdit(permissions, task);
      const { count } = db.prepare('SELECT count(*) AS count FROM task_links WHERE task_id = ?').get(task.id) as { count: number };
      if (count >= limits.links) throw new HttpError(409, 'LIMIT_REACHED', `Bir göreve en çok ${limits.links} bağlantı eklenebilir.`);
      db.prepare('INSERT INTO task_links (id, task_id, url, label, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), task.id, url, label, new Date().toISOString());
    })();
    res.status(201).json(details(actor, String(req.params.id)));
  });
  app.delete('/api/tasks/:id/links/:linkId', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const { task, permissions } = load(actor, String(req.params.id));
    requireEdit(permissions, task);
    if (!db.prepare('DELETE FROM task_links WHERE id = ? AND task_id = ?').run(String(req.params.linkId), task.id).changes) throw new HttpError(404, 'NOT_FOUND', 'Bağlantı bulunamadı.');
    res.json(details(actor, task.id));
  });

  /** Replaces the task's labels; unknown names become committee labels. */
  app.put('/api/tasks/:id/labels', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['names']);
    if (!Array.isArray(body.names)) throw new HttpError(400, 'INVALID_DETAIL', 'Etiket listesi gerekli.');
    // Keeps the first spelling of names that differ only by case.
    const names = body.names.map(name => text(name, 'Etiket', 30)!)
      .filter((name, index, all) => all.findIndex(other => other.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR')) === index);
    if (names.length > limits.labels) throw new HttpError(400, 'INVALID_DETAIL', `Bir görevde en çok ${limits.labels} etiket olabilir.`);
    db.transaction(() => {
      const { task, access, permissions } = load(actor, String(req.params.id));
      requireEdit(permissions, task);
      if (!permissions.labels) throw new HttpError(403, 'FORBIDDEN', 'Etiketleri yalnız komite başkanı değiştirebilir.');
      db.prepare('DELETE FROM task_labels WHERE task_id = ?').run(task.id);
      for (const name of names) {
        db.prepare('INSERT OR IGNORE INTO labels (id, committee_id, name) VALUES (?, ?, ?)').run(randomUUID(), access.id, name);
        const label = db.prepare('SELECT id FROM labels WHERE committee_id = ? AND name = ?').get(access.id, name) as { id: string };
        db.prepare('INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES (?, ?)').run(task.id, label.id);
      }
    })();
    res.json(details(actor, String(req.params.id)));
  });
}
