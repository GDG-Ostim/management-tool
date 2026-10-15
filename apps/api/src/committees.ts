import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { committeeAccess, isAdmin, plainObject, type Actor } from './access.js';
import { HttpError } from './errors.js';

type CommitteeRow = { id: string; name: string; description: string; archivedAt: string | null; myRole: string | null; memberCount: number; openTasks: number };

function text(value: unknown, field: string, max: number, required: boolean) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) throw new HttpError(400, 'INVALID_COMMITTEE', `${field} en çok ${max} karakter olmalı${required ? ' ve boş bırakılmamalı' : ''}.`);
  return value.trim();
}

export function registerCommitteeRoutes(app: Express, db: Database.Database, guards: { requireMember: RequestHandler; requireAdmin: RequestHandler }) {
  const { requireMember, requireAdmin } = guards;
  const select = `SELECT c.id, c.name, c.description, c.archived_at AS archivedAt,
      (SELECT role FROM committee_memberships WHERE committee_id = c.id AND user_id = @actor) AS myRole,
      (SELECT count(*) FROM committee_memberships m JOIN user_profiles p ON p.user_id = m.user_id WHERE m.committee_id = c.id AND p.active = 1) AS memberCount,
      (SELECT count(*) FROM tasks t WHERE t.committee_id = c.id AND t.archived_at IS NULL AND t.status != 'done') AS openTasks
    FROM committees c`;
  const one = (actor: Actor, id: string) => db.prepare(`${select} WHERE c.id = @id`).get({ actor: actor.id, id }) as CommitteeRow;
  const members = (id: string) => db.prepare(`SELECT u.id, u.name, u.email, m.role, p.active FROM committee_memberships m
      JOIN user u ON u.id = m.user_id JOIN user_profiles p ON p.user_id = u.id
      WHERE m.committee_id = ? ORDER BY m.role, u.name COLLATE NOCASE`).all(id)
    .map(row => ({ ...(row as { id: string; name: string; role: string; active: number }), active: (row as { active: number }).active === 1 }));

  app.get('/api/committees', requireMember, (_req, res) => {
    const actor = res.locals.user as Actor;
    const rows = isAdmin(actor)
      ? db.prepare(`${select} ORDER BY c.archived_at IS NOT NULL, c.name COLLATE NOCASE`).all({ actor: actor.id })
      : db.prepare(`${select} WHERE c.archived_at IS NULL AND EXISTS (SELECT 1 FROM committee_memberships WHERE committee_id = c.id AND user_id = @actor) ORDER BY c.name COLLATE NOCASE`).all({ actor: actor.id });
    res.json(rows);
  });

  app.get('/api/committees/:id', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const access = committeeAccess(db, actor, String(req.params.id));
    res.json({ ...one(actor, access.id), members: members(access.id) });
  });

  app.post('/api/committees', requireMember, requireAdmin, (req, res) => {
    const body = plainObject(req.body, ['name', 'description']);
    const name = text(body.name, 'Komite adı', 80, true)!;
    const description = text(body.description, 'Açıklama', 500, false) ?? '';
    if (db.prepare('SELECT 1 FROM committees WHERE name = ?').get(name)) throw new HttpError(409, 'COMMITTEE_EXISTS', 'Bu adla bir komite zaten var.');
    const id = randomUUID();
    db.prepare('INSERT INTO committees (id, name, description, created_at) VALUES (?, ?, ?, ?)').run(id, name, description, new Date().toISOString());
    res.status(201).json({ ...one(res.locals.user, id), members: [] });
  });

  app.patch('/api/committees/:id', requireMember, requireAdmin, (req, res) => {
    const body = plainObject(req.body, ['name', 'description', 'archived']);
    const id = String(req.params.id);
    // A name is optional in the patch, but when sent it must not be blank.
    const name = text(body.name, 'Komite adı', 80, body.name !== undefined);
    const description = text(body.description, 'Açıklama', 500, false);
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw new HttpError(400, 'INVALID_COMMITTEE', 'Arşiv bilgisi geçersiz.');
    db.transaction(() => {
      const current = one(res.locals.user, id);
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Komite bulunamadı.');
      if (name && db.prepare('SELECT 1 FROM committees WHERE name = ? AND id != ?').get(name, id)) throw new HttpError(409, 'COMMITTEE_EXISTS', 'Bu adla bir komite zaten var.');
      if (body.archived === true && !current.archivedAt && current.openTasks) throw new HttpError(409, 'COMMITTEE_HAS_OPEN_TASKS', 'Açık görevleri olan komite arşivlenemez; önce görevleri tamamlayın veya arşivleyin.');
      const archivedAt = body.archived === undefined ? current.archivedAt : body.archived ? current.archivedAt ?? new Date().toISOString() : null;
      db.prepare('UPDATE committees SET name = ?, description = ?, archived_at = ? WHERE id = ?').run(name ?? current.name, description ?? current.description, archivedAt, id);
    })();
    res.json({ ...one(res.locals.user, id), members: members(id) });
  });

  app.put('/api/committees/:id/members/:userId', requireMember, requireAdmin, (req, res) => {
    const body = plainObject(req.body, ['role']);
    if (body.role !== 'lead' && body.role !== 'member') throw new HttpError(400, 'INVALID_MEMBERSHIP', 'Rol komite başkanı veya üye olmalı.');
    const id = String(req.params.id); const userId = String(req.params.userId);
    const committee = one(res.locals.user, id);
    if (!committee) throw new HttpError(404, 'NOT_FOUND', 'Komite bulunamadı.');
    if (committee.archivedAt) throw new HttpError(409, 'COMMITTEE_ARCHIVED', 'Arşivlenmiş komiteye üye eklenemez.');
    const user = db.prepare('SELECT p.active FROM user_profiles p WHERE p.user_id = ?').get(userId) as { active: number } | undefined;
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı.');
    if (!user.active) throw new HttpError(409, 'USER_INACTIVE', 'Pasif kullanıcı komiteye eklenemez.');
    db.prepare(`INSERT INTO committee_memberships (committee_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (committee_id, user_id) DO UPDATE SET role = excluded.role`).run(id, userId, body.role, new Date().toISOString());
    res.json({ ...one(res.locals.user, id), members: members(id) });
  });

  app.delete('/api/committees/:id/members/:userId', requireMember, requireAdmin, (req, res) => {
    const id = String(req.params.id); const userId = String(req.params.userId);
    db.transaction(() => {
      if (!db.prepare('SELECT 1 FROM committee_memberships WHERE committee_id = ? AND user_id = ?').get(id, userId)) throw new HttpError(404, 'NOT_FOUND', 'Üyelik bulunamadı.');
      const open = db.prepare("SELECT count(*) AS count FROM tasks WHERE committee_id = ? AND assignee_id = ? AND archived_at IS NULL AND status != 'done'").get(id, userId) as { count: number };
      if (open.count) throw new HttpError(409, 'MEMBER_HAS_OPEN_TASKS', `Bu kişinin komitede ${open.count} açık görevi var; önce görevleri başka üyeye atayın.`);
      db.prepare('DELETE FROM committee_memberships WHERE committee_id = ? AND user_id = ?').run(id, userId);
    })();
    res.json({ ...one(res.locals.user, id), members: members(id) });
  });
}
