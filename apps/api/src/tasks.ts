import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { committeeAccess, isActiveMember, isAdmin, plainObject, type Actor } from './access.js';
import { HttpError } from './errors.js';

export const statuses = ['todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = typeof statuses[number];
const priorities = ['low', 'normal', 'high'] as const;

type TaskRow = {
  id: string; committeeId: string; committeeName: string; title: string; description: string;
  assigneeId: string; assigneeName: string; createdBy: string; status: TaskStatus; priority: string;
  dueAt: string | null; version: number; createdAt: string; updatedAt: string; completedAt: string | null;
};

const select = `SELECT t.id, t.committee_id AS committeeId, c.name AS committeeName, t.title, t.description,
    t.assignee_id AS assigneeId, u.name AS assigneeName, t.created_by AS createdBy, t.status, t.priority,
    t.due_at AS dueAt, t.version, t.created_at AS createdAt, t.updated_at AS updatedAt, t.completed_at AS completedAt
  FROM tasks t JOIN committees c ON c.id = t.committee_id JOIN user u ON u.id = t.assignee_id`;

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
    return {
      ...row,
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
    const rows = db.prepare(`${select} WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC LIMIT 500`).all(params) as TaskRow[];
    const manages = new Map<string, boolean>();
    res.json(rows.map(row => {
      if (!manages.has(row.committeeId)) manages.set(row.committeeId, committeeAccess(db, actor, row.committeeId).manage);
      return view(row, actor, manages.get(row.committeeId));
    }));
  });

  app.post('/api/tasks', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const body = plainObject(req.body, ['committeeId', 'title', 'description', 'assigneeId', 'priority', 'dueAt']);
    if (typeof body.committeeId !== 'string') throw new HttpError(400, 'INVALID_TASK', 'Komite seçilmeli.');
    const access = committeeAccess(db, actor, body.committeeId);
    if (access.archivedAt) throw new HttpError(409, 'COMMITTEE_ARCHIVED', 'Arşivlenmiş komiteye görev açılamaz.');
    const assigneeId = body.assigneeId === undefined ? actor.id : String(body.assigneeId);
    if (!access.manage && assigneeId !== actor.id) throw new HttpError(403, 'FORBIDDEN', 'Üyeler yalnız kendilerine görev açabilir.');
    if (!isActiveMember(db, assigneeId, access.id)) throw new HttpError(400, 'INVALID_ASSIGNEE', 'Sorumlu bu komitenin aktif üyesi olmalı.');
    const now = new Date().toISOString(); const id = randomUUID();
    db.prepare(`INSERT INTO tasks (id, committee_id, title, description, assignee_id, created_by, priority, due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, access.id, text(body.title, 'Başlık', 160, true), text(body.description, 'Açıklama', 10_000, false) ?? '',
      assigneeId, actor.id, priority(body.priority) ?? 'normal', dueAt(body.dueAt) ?? null, now, now);
    res.status(201).json(view(load(actor, id).row, actor));
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
      return load(actor, row.id).row;
    })();
    res.json(view(updated, actor));
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
      return load(actor, row.id).row;
    })();
    res.json(view(updated, actor));
  });
}
