import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import type { Priority, TaskStatus } from '@gdg/shared';
import { committeeAccess, isActiveMember, isAdmin, plainObject, type Actor } from './access.js';
import { HttpError } from './errors.js';
import { enqueueTaskNotification } from './notifications.js';

export const statuses: readonly TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];
const priorities: readonly Priority[] = ['low', 'normal', 'high'];
/** Board list caps: every open task of a community fits; Done shows the most recent completions. */
export const boardLimits = { open: 1000, done: 200 };

type TaskRow = {
  id: string; committeeId: string; committeeName: string; title: string; description: string;
  assigneeId: string; assigneeName: string; assigneeEmail: string; createdBy: string; status: TaskStatus; priority: string;
  dueAt: string | null; version: number; createdAt: string; updatedAt: string; completedAt: string | null;
  lastResolution: string | null; lastResolvedAt: string | null; lastReopenAt: string | null;
};

const select = `SELECT t.id, t.committee_id AS committeeId, c.name AS committeeName, t.title, t.description,
    t.assignee_id AS assigneeId, u.name AS assigneeName, u.email AS assigneeEmail, t.created_by AS createdBy, t.status, t.priority,
    t.due_at AS dueAt, t.version, t.created_at AS createdAt, t.updated_at AS updatedAt, t.completed_at AS completedAt,
    ls.resolution AS lastResolution, ls.resolved_at AS lastResolvedAt,
    (SELECT max(o.created_at) FROM task_reopens o WHERE o.task_id = t.id) AS lastReopenAt
  FROM tasks t JOIN committees c ON c.id = t.committee_id JOIN user u ON u.id = t.assignee_id
  LEFT JOIN task_submissions ls ON ls.id = (SELECT s.id FROM task_submissions s WHERE s.task_id = t.id ORDER BY s.submitted_at DESC, s.rowid DESC LIMIT 1)`;

/** Why an open task came back to its assignee, if the latest review event sent it back. */
function returned(row: TaskRow): 'rejected' | 'reopened' | null {
  if (row.status !== 'todo' && row.status !== 'in_progress') return null;
  if (row.lastReopenAt && (!row.lastResolvedAt || row.lastReopenAt >= row.lastResolvedAt)) return 'reopened';
  return row.lastResolution === 'rejected' ? 'rejected' : null;
}

/** Moves the actor may request from the task's current column; reasons are enforced on transition. */
export function allowedMoves(task: Pick<TaskRow, 'status' | 'assigneeId'>, actor: Actor, manage: boolean): TaskStatus[] {
  const own = task.assigneeId === actor.id || manage;
  switch (task.status) {
    case 'todo': return own ? ['in_progress', 'in_review'] : [];
    case 'in_progress': return own ? ['todo', 'in_review'] : [];
    case 'in_review': return [...(own ? ['in_progress' as const] : []), ...(manage ? ['done' as const] : [])];
    case 'done': return manage ? ['in_progress'] : [];
  }
}

function text(value: unknown, field: string, max: number, required: boolean) {
  if (value === undefined) { if (required) throw new HttpError(400, 'INVALID_TASK', `${field} gerekli.`); return undefined; }
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, 'INVALID_TASK', `${field} ${required ? '1–' : 'en çok '}${max} karakter olmalı.`);
  return value.trim();
}

function dueAt(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) throw new HttpError(400, 'INVALID_TASK', 'Son tarih geçersiz.');
  return new Date(value).toISOString();
}

function priority(value: unknown) {
  if (value === undefined) return undefined;
  if (!priorities.includes(value as never)) throw new HttpError(400, 'INVALID_TASK', 'Öncelik düşük, normal veya yüksek olmalı.');
  return value as string;
}

export function registerTaskRoutes(app: Express, db: Database.Database, guards: { requireMember: RequestHandler }) {
  const { requireMember } = guards;
  const view = (row: TaskRow, actor: Actor, manage = isAdmin(actor) || committeeAccess(db, actor, row.committeeId).manage) => {
    const locked = row.status === 'in_review' || row.status === 'done';
    const { lastResolution: _resolution, lastResolvedAt: _resolvedAt, lastReopenAt: _reopenAt, ...task } = row;
    return {
      ...task, returned: returned(row),
      permissions: { edit: !locked && (manage || row.assigneeId === actor.id), manage, moves: allowedMoves(row, actor, manage) },
    };
  };
  const load = (actor: Actor, id: string) => {
    const row = db.prepare(`${select} WHERE t.id = ? AND t.archived_at IS NULL`).get(id) as TaskRow | undefined;
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Görev bulunamadı.');
    const access = committeeAccess(db, actor, row.committeeId);
    return { row, access };
  };
  const requireVersion = (value: unknown, row: TaskRow, actor: Actor) => {
    if (!Number.isInteger(value)) throw new HttpError(400, 'INVALID_TASK', 'Görev sürümü gerekli.');
    if (value !== row.version) throw new HttpError(409, 'VERSION_CONFLICT', 'Görev başka biri tarafından güncellendi; güncel hali yüklendi.', view(row, actor));
  };

  app.get('/api/tasks', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const query = req.query as Record<string, unknown>;
    const where = ['t.archived_at IS NULL'];
    const params: Record<string, string> = { actor: actor.id };
    if (query.committeeId !== undefined) {
      const access = committeeAccess(db, actor, String(query.committeeId));
      where.push('t.committee_id = @committee'); params.committee = access.id;
    } else {
      where.push('c.archived_at IS NULL');
      if (!isAdmin(actor)) where.push('EXISTS (SELECT 1 FROM committee_memberships m WHERE m.committee_id = t.committee_id AND m.user_id = @actor)');
    }
    if (query.assigneeId !== undefined) { where.push('t.assignee_id = @assignee'); params.assignee = String(query.assigneeId); }
    if (query.status !== undefined) {
      if (!statuses.includes(query.status as never)) throw new HttpError(400, 'INVALID_FILTER', 'Durum filtresi geçersiz.');
      where.push('t.status = @status'); params.status = String(query.status);
    }
    if (typeof query.q === 'string' && query.q.trim()) {
      where.push("t.title LIKE @q ESCAPE '\\'"); params.q = `%${query.q.trim().slice(0, 100).replace(/[\\%_]/g, char => `\\${char}`)}%`;
    }
    // Open work is never cut off by old completed work: open tasks come first, the Done column shows the latest completions.
    const filter = where.join(' AND ');
    const rows = [
      ...db.prepare(`${select} WHERE ${filter} AND t.status != 'done' ORDER BY t.updated_at DESC LIMIT ${boardLimits.open}`).all(params),
      ...db.prepare(`${select} WHERE ${filter} AND t.status = 'done' ORDER BY t.completed_at DESC LIMIT ${boardLimits.done}`).all(params),
    ] as TaskRow[];
    const manages = new Map<string, boolean>();
    res.json(rows.map(row => {
      if (!manages.has(row.committeeId)) manages.set(row.committeeId, committeeAccess(db, actor, row.committeeId).manage);
      return view(row, actor, manages.get(row.committeeId));
    }));
  });

  app.get('/api/tasks/:id', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    res.json(view(load(actor, String(req.params.id)).row, actor));
  });

  app.post('/api/tasks', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['committeeId', 'title', 'description', 'assigneeId', 'assigneeIds', 'priority', 'dueAt']);
    if (typeof body.committeeId !== 'string') throw new HttpError(400, 'INVALID_TASK', 'Komite seçilmeli.');
    const access = committeeAccess(db, actor, body.committeeId);
    if (access.archivedAt) throw new HttpError(409, 'COMMITTEE_ARCHIVED', 'Arşivlenmiş komiteye görev açılamaz.');
    const isMulti = Array.isArray(body.assigneeIds);
    const rawAssigneeIds = isMulti
      ? (body.assigneeIds as unknown[]).map(String)
      : body.assigneeId !== undefined
        ? [String(body.assigneeId)]
        : [actor.id];
    if (!rawAssigneeIds.length) throw new HttpError(400, 'INVALID_ASSIGNEE', 'En az bir sorumlu seçilmeli.');
    const assigneeIds = [...new Set(rawAssigneeIds)];
    if (!access.manage && (assigneeIds.length !== 1 || assigneeIds[0] !== actor.id)) {
      throw new HttpError(403, 'FORBIDDEN', 'Üyeler yalnız kendilerine görev açabilir.');
    }
    for (const assigneeId of assigneeIds) {
      if (!isActiveMember(db, assigneeId, access.id)) {
        throw new HttpError(400, 'INVALID_ASSIGNEE', 'Sorumlu bu komitenin aktif üyesi olmalı.');
      }
    }
    const taskTitle = text(body.title, 'Başlık', 160, true)!;
    const taskDescription = text(body.description, 'Açıklama', 10_000, false) ?? '';
    const taskPriority = priority(body.priority) ?? 'normal';
    const taskDueAt = dueAt(body.dueAt) ?? null;
    const createdIds: string[] = [];
    db.transaction(() => {
      for (const assigneeId of assigneeIds) {
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO tasks (id, committee_id, title, description, assignee_id, created_by, priority, due_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, access.id, taskTitle, taskDescription,
          assigneeId, actor.id, taskPriority, taskDueAt, now, now);
        enqueueTaskNotification(db, id, 'assignment', actor.id);
        createdIds.push(id);
      }
    })();
    if (isMulti) {
      res.status(201).json(createdIds.map(id => view(load(actor, id).row, actor)));
    } else {
      res.status(201).json(view(load(actor, createdIds[0]).row, actor));
    }
  });

  app.patch('/api/tasks/:id', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['version', 'title', 'description', 'assigneeId', 'priority', 'dueAt']);
    const updated = db.transaction(() => {
      const { row, access } = load(actor, String(req.params.id));
      requireVersion(body.version, row, actor);
      if (!access.manage && row.assigneeId !== actor.id) throw new HttpError(403, 'FORBIDDEN', 'Bu görevi düzenleme yetkin yok.');
      if (row.status === 'in_review' || row.status === 'done') throw new HttpError(409, 'TASK_LOCKED', row.status === 'done' ? 'Tamamlanan görev düzenlenemez; önce yeniden açılmalı.' : 'İncelemedeki görev düzenlenemez; önce teslim geri çekilmeli.');
      const managerFields = ['assigneeId', 'priority', 'dueAt'].filter(key => body[key] !== undefined);
      if (!access.manage && managerFields.length) throw new HttpError(403, 'FORBIDDEN', 'Sorumlu, öncelik ve son tarihi yalnız komite başkanı değiştirebilir.');
      if (body.assigneeId !== undefined && !isActiveMember(db, String(body.assigneeId), row.committeeId)) throw new HttpError(400, 'INVALID_ASSIGNEE', 'Sorumlu bu komitenin aktif üyesi olmalı.');
      const next = {
        title: text(body.title, 'Başlık', 160, false) ?? row.title,
        description: text(body.description, 'Açıklama', 10_000, false) ?? row.description,
        assigneeId: body.assigneeId === undefined ? row.assigneeId : String(body.assigneeId),
        priority: priority(body.priority) ?? row.priority,
        dueAt: body.dueAt === undefined ? row.dueAt : dueAt(body.dueAt)!,
      };
      if (!next.title) throw new HttpError(400, 'INVALID_TASK', 'Başlık 1–160 karakter olmalı.');
      db.prepare(`UPDATE tasks SET title = ?, description = ?, assignee_id = ?, priority = ?, due_at = ?, version = version + 1, updated_at = ? WHERE id = ?`)
        .run(next.title, next.description, next.assigneeId, next.priority, next.dueAt, new Date().toISOString(), row.id);
      if (next.assigneeId !== row.assigneeId) enqueueTaskNotification(db, row.id, 'assignment', actor.id);
      return load(actor, row.id).row;
    })();
    res.json(view(updated, actor));
  });

  /** Tasks are never deleted: a manager archives them. Archived open work leaves boards and counts; completed work stays in reports. */
  app.post('/api/tasks/:id/archive', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['version']);
    const archivedAt = db.transaction(() => {
      const { row, access } = load(actor, String(req.params.id));
      if (!access.manage) throw new HttpError(403, 'FORBIDDEN', 'Görevi yalnız komite başkanı arşivleyebilir.');
      requireVersion(body.version, row, actor);
      const now = new Date().toISOString();
      // A pending submission is withdrawn so no review waits on a task nobody can see.
      db.prepare("UPDATE task_submissions SET resolution = 'withdrawn', resolved_at = ?, resolved_by = ? WHERE task_id = ? AND resolution = 'pending'").run(now, actor.id, row.id);
      db.prepare('UPDATE tasks SET archived_at = ?, version = version + 1, updated_at = ? WHERE id = ?').run(now, now, row.id);
      return now;
    })();
    res.json({ id: String(req.params.id), archivedAt });
  });

  app.post('/api/tasks/:id/transition', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['version', 'status', 'reason']);
    if (!statuses.includes(body.status as never)) throw new HttpError(400, 'INVALID_TRANSITION', 'Hedef durum geçersiz.');
    const target = body.status as TaskStatus;
    const reason = body.reason === undefined ? undefined : text(body.reason, 'Gerekçe', 1000, true);
    const updated = db.transaction(() => {
      const { row, access } = load(actor, String(req.params.id));
      if (row.status === target) return row;
      requireVersion(body.version, row, actor);
      if (!allowedMoves(row, actor, access.manage).includes(target)) {
        const forbidden = !access.manage && (target === 'done' || row.status === 'done' || row.assigneeId !== actor.id);
        throw forbidden
          ? new HttpError(403, 'FORBIDDEN', target === 'done' ? 'Görevi yalnız komite başkanı tamamlayabilir.' : 'Bu görevin durumunu değiştirme yetkin yok.')
          : new HttpError(409, 'INVALID_TRANSITION', 'Görev bu sütuna doğrudan taşınamaz; önce incelemeye gönderilmeli.');
      }
      const now = new Date().toISOString();
      const pending = db.prepare("SELECT id FROM task_submissions WHERE task_id = ? AND resolution = 'pending'").get(row.id) as { id: string } | undefined;
      let completedAt = row.completedAt; let completedBy: string | null = null; let approved: string | null = null;
      if (target === 'in_review') {
        db.prepare(`INSERT INTO task_submissions (id, task_id, submitted_at, submitted_by, assignee_id_snapshot, due_at_snapshot) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), row.id, now, actor.id, row.assigneeId, row.dueAt);
      } else if (row.status === 'in_review' && target === 'in_progress') {
        const withdraw = row.assigneeId === actor.id && !reason;
        if (!withdraw && !reason) throw new HttpError(400, 'REASON_REQUIRED', 'Teslimi reddetmek için gerekçe yaz.');
        db.prepare('UPDATE task_submissions SET resolution = ?, resolved_at = ?, resolved_by = ?, reason = ? WHERE id = ?')
          .run(withdraw ? 'withdrawn' : 'rejected', now, actor.id, withdraw ? null : reason, pending!.id);
      } else if (target === 'done') {
        db.prepare("UPDATE task_submissions SET resolution = 'approved', resolved_at = ?, resolved_by = ? WHERE id = ?").run(now, actor.id, pending!.id);
        completedAt = now; completedBy = actor.id; approved = pending!.id;
      } else if (row.status === 'done') {
        if (!reason) throw new HttpError(400, 'REASON_REQUIRED', 'Görevi yeniden açmak için gerekçe yaz.');
        const previous = db.prepare('SELECT approved_submission_id AS id FROM tasks WHERE id = ?').get(row.id) as { id: string | null };
        db.prepare('INSERT INTO task_reopens (id, task_id, previous_submission_id, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), row.id, previous.id, actor.id, reason, now);
        completedAt = null;
      }
      db.prepare(`UPDATE tasks SET status = ?, completed_at = ?, completed_by = ?, approved_submission_id = ?, version = version + 1, updated_at = ? WHERE id = ?`)
        .run(target, target === 'done' ? completedAt : null, completedBy, approved, now, row.id);
      if (target === 'in_review') enqueueTaskNotification(db, row.id, 'review', actor.id);
      else if (target === 'done' || row.status === 'done' || (row.status === 'in_review' && reason)) enqueueTaskNotification(db, row.id, 'decision', actor.id);
      return load(actor, row.id).row;
    })();
    res.json(view(updated, actor));
  });

  /** Short review history for the task window; anyone who can read the committee can read it. */
  app.get('/api/tasks/:id/reviews', requireMember, (req, res) => {
    const { row } = load(res.locals.user as Actor, String(req.params.id));
    const submissions = db.prepare(`SELECT s.id, s.submitted_at AS submittedAt, su.name AS submittedBy, su.email AS submittedByEmail, au.name AS assigneeName,
        s.due_at_snapshot AS dueAt, s.resolution, s.resolved_at AS resolvedAt, ru.name AS resolvedBy, ru.email AS resolvedByEmail, s.reason
      FROM task_submissions s JOIN user su ON su.id = s.submitted_by JOIN user au ON au.id = s.assignee_id_snapshot
      LEFT JOIN user ru ON ru.id = s.resolved_by WHERE s.task_id = ? ORDER BY s.submitted_at DESC, s.rowid DESC`).all(row.id) as Array<{ submittedAt: string; dueAt: string | null }>;
    const reopens = db.prepare(`SELECT o.id, o.created_at AS createdAt, u.name AS actorName, u.email AS actorEmail, o.reason
      FROM task_reopens o JOIN user u ON u.id = o.actor_id WHERE o.task_id = ? ORDER BY o.created_at DESC, o.rowid DESC`).all(row.id);
    res.json({
      submissions: submissions.map(item => ({ ...item, onTime: item.dueAt ? item.submittedAt <= item.dueAt : null })),
      reopens,
    });
  });
}
