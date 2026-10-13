import type Database from 'better-sqlite3';
import { HttpError } from './errors.js';

export type CommitteeRole = 'lead' | 'member';
export interface Actor { id: string; role?: string | null }

export const isAdmin = (actor: Actor) => actor.role === 'super_admin';

export function committeeRole(db: Database.Database, userId: string, committeeId: string): CommitteeRole | null {
  const row = db.prepare('SELECT role FROM committee_memberships WHERE committee_id = ? AND user_id = ?').get(committeeId, userId) as { role: CommitteeRole } | undefined;
  return row?.role ?? null;
}

export interface CommitteeAccess { id: string; name: string; archivedAt: string | null; role: CommitteeRole | null; manage: boolean }

/** Resolves a committee the actor may read; unknown and invisible committees both return 404. */
export function committeeAccess(db: Database.Database, actor: Actor, committeeId: string): CommitteeAccess {
  const committee = db.prepare('SELECT id, name, archived_at AS archivedAt FROM committees WHERE id = ?').get(committeeId) as Omit<CommitteeAccess, 'role' | 'manage'> | undefined;
  const role = committee ? committeeRole(db, actor.id, committeeId) : null;
  if (!committee || (!isAdmin(actor) && (!role || committee.archivedAt))) throw new HttpError(404, 'NOT_FOUND', 'Komite bulunamadı.');
  return { ...committee, role, manage: isAdmin(actor) || role === 'lead' };
}

export function isActiveMember(db: Database.Database, userId: string, committeeId: string) {
  return !!db.prepare(`SELECT 1 FROM committee_memberships m JOIN user_profiles p ON p.user_id = m.user_id
    WHERE m.committee_id = ? AND m.user_id = ? AND p.active = 1`).get(committeeId, userId);
}

export function plainObject(body: unknown, allowed: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_BODY', 'İstek içeriği geçersiz.');
  const extra = Object.keys(body).filter(key => !allowed.includes(key));
  if (extra.length) throw new HttpError(400, 'INVALID_BODY', `Beklenmeyen alan: ${extra.join(', ')}.`);
  return body as Record<string, unknown>;
}
