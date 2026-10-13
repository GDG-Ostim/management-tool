import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { committeeAccess, isAdmin, type Actor } from './access.js';
import { HttpError } from './errors.js';

type Row = {
  id: string; title: string; committeeId: string; committeeName: string; assigneeId: string; assigneeName: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'done'; dueAt: string | null; completedAt: string | null; archivedAt: string | null;
  approvedSubmittedAt: string | null; approvedDue: string | null; approvedAssigneeId: string | null; approvedAssigneeName: string | null;
  pendingSubmittedAt: string | null; pendingDue: string | null; rejections: number; reopens: number; links: string;
};
export type Timing = 'on_time' | 'late' | 'undated' | 'overdue' | null;
export interface Summary { completed: number; onTime: number; late: number; undated: number; openOverdue: number; overdueTotal: number; inReview: number; open: number }

const emptySummary = (): Summary => ({ completed: 0, onTime: 0, late: 0, undated: 0, openOverdue: 0, overdueTotal: 0, inReview: 0, open: 0 });

const select = `SELECT t.id, t.title, t.committee_id AS committeeId, c.name AS committeeName, t.assignee_id AS assigneeId, u.name AS assigneeName,
    t.status, t.due_at AS dueAt, t.completed_at AS completedAt, t.archived_at AS archivedAt,
    s.submitted_at AS approvedSubmittedAt, s.due_at_snapshot AS approvedDue, s.assignee_id_snapshot AS approvedAssigneeId, au.name AS approvedAssigneeName,
    p.submitted_at AS pendingSubmittedAt, p.due_at_snapshot AS pendingDue,
    (SELECT count(*) FROM task_submissions r WHERE r.task_id = t.id AND r.resolution = 'rejected') AS rejections,
    (SELECT count(*) FROM task_reopens o WHERE o.task_id = t.id) AS reopens,
    (SELECT json_group_array(json_object('url', url, 'label', label)) FROM (SELECT url, label FROM task_links WHERE task_id = t.id ORDER BY created_at)) AS links
  FROM tasks t JOIN committees c ON c.id = t.committee_id JOIN user u ON u.id = t.assignee_id
  LEFT JOIN task_submissions s ON s.id = t.approved_submission_id AND t.status = 'done'
  LEFT JOIN user au ON au.id = s.assignee_id_snapshot
  LEFT JOIN task_submissions p ON p.task_id = t.id AND p.resolution = 'pending'`;

/** Classifies one task; completed work is judged by its approved submission, open work by the current deadline. */
export function timing(row: Row, now: string): Timing {
  if (row.status === 'done') {
    if (!row.approvedDue || !row.approvedSubmittedAt) return 'undated';
    return row.approvedSubmittedAt <= row.approvedDue ? 'on_time' : 'late';
  }
  if (!row.dueAt || row.dueAt >= now) return null;
  // A submission made before its deadline snapshot is not overdue while it waits for review.
  if (row.status === 'in_review' && row.pendingSubmittedAt && row.pendingDue && row.pendingSubmittedAt <= row.pendingDue) return null;
  return 'overdue';
}

/** Person attribution: completed work belongs to the approved assignee snapshot, open work to the current assignee. */
const owner = (row: Row) => row.status === 'done' ? row.approvedAssigneeId ?? row.assigneeId : row.assigneeId;
const ownerName = (row: Row) => row.status === 'done' ? row.approvedAssigneeName ?? row.assigneeName : row.assigneeName;

function summarize(rows: Row[], now: string) {
  const summary = emptySummary();
  for (const row of rows) {
    const kind = timing(row, now);
    if (row.status === 'done') {
      summary.completed += 1;
      if (kind === 'on_time') summary.onTime += 1; else if (kind === 'late') summary.late += 1; else summary.undated += 1;
    } else {
      if (row.status === 'in_review') summary.inReview += 1; else summary.open += 1;
      if (kind === 'overdue') summary.openOverdue += 1;
    }
  }
  summary.overdueTotal = summary.late + summary.openOverdue;
  return summary;
}

const toItem = (row: Row, now: string) => ({
  id: row.id, title: row.title, committeeId: row.committeeId, committeeName: row.committeeName,
  personId: owner(row), personName: ownerName(row), status: row.status, dueAt: row.status === 'done' ? row.approvedDue : row.dueAt,
  submittedAt: row.status === 'done' ? row.approvedSubmittedAt : row.pendingSubmittedAt, completedAt: row.completedAt,
  timing: timing(row, now), rejections: row.rejections, reopens: row.reopens,
  links: JSON.parse(row.links) as Array<{ url: string; label: string }>,
});

function group(rows: Row[], now: string, key: (row: Row) => string, name: (row: Row) => string) {
  const groups = new Map<string, { id: string; name: string; rows: Row[] }>();
  for (const row of rows) {
    const id = key(row);
    if (!groups.has(id)) groups.set(id, { id, name: name(row), rows: [] });
    groups.get(id)!.rows.push(row);
  }
  return [...groups.values()].map(item => ({ id: item.id, name: item.name, summary: summarize(item.rows, now) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export function registerReportRoutes(app: Express, db: Database.Database, guards: { requireMember: RequestHandler }) {
  const { requireMember } = guards;
  /** Open archived tasks leave the report; completed history stays even when archived. */
  const load = (committeeIds: string[] | 'all') => {
    const rows = committeeIds === 'all'
      ? db.prepare(select).all() as Row[]
      : committeeIds.length ? db.prepare(`${select} WHERE t.committee_id IN (${committeeIds.map(() => '?').join(',')})`).all(...committeeIds) as Row[] : [];
    return rows.filter(row => row.status === 'done' || !row.archivedAt);
  };
  const ledCommittees = (userId: string) => (db.prepare("SELECT committee_id AS id FROM committee_memberships WHERE user_id = ? AND role = 'lead'").all(userId) as Array<{ id: string }>).map(row => row.id);
  const memberCommittees = (userId: string) => db.prepare(`SELECT c.id, c.name, m.role, c.archived_at AS archivedAt FROM committee_memberships m JOIN committees c ON c.id = m.committee_id
    WHERE m.user_id = ? ORDER BY c.name COLLATE NOCASE`).all(userId) as Array<{ id: string; name: string; role: string; archivedAt: string | null }>;

  const personReport = (userId: string, scope: string[] | 'all') => {
    const user = db.prepare('SELECT u.id, u.name, p.active FROM user u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?').get(userId) as { id: string; name: string; active: number } | undefined;
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Kişi bulunamadı.');
    const now = new Date().toISOString();
    const rows = load(scope).filter(row => owner(row) === userId);
    const committees = memberCommittees(userId).filter(item => scope === 'all' || scope.includes(item.id));
    return {
      generatedAt: now, person: { id: user.id, name: user.name, active: user.active === 1 }, committees,
      summary: summarize(rows, now), byCommittee: group(rows, now, row => row.committeeId, row => row.committeeName),
      tasks: rows.map(row => toItem(row, now)),
    };
  };

  app.get('/api/reports/me', requireMember, (_req, res) => {
    res.json(personReport((res.locals.user as Actor).id, 'all'));
  });

  app.get('/api/reports/users/:id', requireMember, (req, res) => {
    const actor = res.locals.user as Actor; const target = String(req.params.id);
    if (target === actor.id || isAdmin(actor)) { res.json(personReport(target, 'all')); return; }
    const targetCommittees = new Set(memberCommittees(target).map(item => item.id));
    const scope = ledCommittees(actor.id).filter(id => targetCommittees.has(id));
    // Leads only see people in committees they lead; everyone else gets the same 404 as an unknown user.
    if (!scope.length) throw new HttpError(404, 'NOT_FOUND', 'Kişi bulunamadı.');
    res.json(personReport(target, scope));
  });

  app.get('/api/reports/committees/:id', requireMember, (req, res) => {
    const actor = res.locals.user as Actor;
    const access = committeeAccess(db, actor, String(req.params.id));
    if (!access.manage) throw new HttpError(403, 'FORBIDDEN', 'Komite raporunu yalnız komite başkanı ve başkan görebilir.');
    const now = new Date().toISOString();
    const rows = load([access.id]);
    const members = db.prepare(`SELECT u.id, u.name, m.role, p.active FROM committee_memberships m JOIN user u ON u.id = m.user_id
      JOIN user_profiles p ON p.user_id = u.id WHERE m.committee_id = ?`).all(access.id) as Array<{ id: string; name: string; role: string; active: number }>;
    const people = new Map(members.map(member => [member.id, { id: member.id, name: member.name, role: member.role as string | null, active: member.active === 1 }]));
    // Former members keep their completed history in the committee report.
    for (const row of rows) if (!people.has(owner(row))) people.set(owner(row), { id: owner(row), name: ownerName(row), role: null, active: false });
    const byPerson = [...people.values()].map(person => ({ ...person, summary: summarize(rows.filter(row => owner(row) === person.id), now) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    res.json({
      generatedAt: now, committee: { id: access.id, name: access.name, archivedAt: access.archivedAt },
      memberCount: members.filter(member => member.active === 1).length,
      summary: summarize(rows, now), byPerson, tasks: rows.map(row => toItem(row, now)),
    });
  });

  app.get('/api/reports/overview', requireMember, (_req, res) => {
    const actor = res.locals.user as Actor;
    if (!isAdmin(actor)) throw new HttpError(403, 'FORBIDDEN', 'Genel raporu yalnız başkan görebilir.');
    const now = new Date().toISOString();
    const rows = load('all');
    const memberCount = (db.prepare(`SELECT count(DISTINCT m.user_id) AS count FROM committee_memberships m
      JOIN user_profiles p ON p.user_id = m.user_id JOIN committees c ON c.id = m.committee_id WHERE p.active = 1 AND c.archived_at IS NULL`).get() as { count: number }).count;
    const committees = db.prepare('SELECT id, name, archived_at AS archivedAt FROM committees ORDER BY name COLLATE NOCASE').all() as Array<{ id: string; name: string; archivedAt: string | null }>;
    res.json({
      generatedAt: now, memberCount, committeeCount: committees.filter(item => !item.archivedAt).length,
      summary: summarize(rows, now),
      byCommittee: committees.map(item => ({ ...item, summary: summarize(rows.filter(row => row.committeeId === item.id), now) })),
      byPerson: group(rows, now, owner, ownerName),
    });
  });
}
