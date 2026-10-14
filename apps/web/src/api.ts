import type { ApiFailure, CommitteeRole, Priority, Summary, TaskStatus, Timing } from '@gdg/shared';

export type { CommitteeRole, Priority, Summary, TaskStatus, Timing };

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '', public current?: unknown) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init?.body ? { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } } : init);
  } catch { throw new ApiError('Bağlantı kurulamadı. İnternet bağlantını kontrol edip yeniden dene.'); }
  if (response.status === 401) { location.assign('/giris'); throw new ApiError('Oturumun sona erdi.', 401); }
  const body = await response.json().catch(() => null) as Partial<ApiFailure> | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? 'İşlem tamamlanamadı.', response.status, body?.error?.code, body?.current);
  return body as T;
}

export const errorMessage = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export type Committee = { id: string; name: string; description: string; archivedAt: string | null; myRole: CommitteeRole | null; memberCount: number; openTasks: number };
export type CommitteeMember = { id: string; name: string; role: CommitteeRole; active: boolean };
export type CommitteeDetail = Committee & { members: CommitteeMember[] };
export type Task = {
  id: string; committeeId: string; committeeName: string; title: string; description: string;
  assigneeId: string; assigneeName: string; createdBy: string; status: TaskStatus; priority: Priority;
  dueAt: string | null; version: number; createdAt: string; updatedAt: string; completedAt: string | null;
  returned: 'rejected' | 'reopened' | null;
  permissions: { edit: boolean; manage: boolean; moves: TaskStatus[] };
};
export type TaskDetails = {
  labels: string[]; checklist: Array<{ id: string; text: string; checked: boolean }>;
  links: Array<{ id: string; url: string; label: string; createdAt: string }>;
  comments: Array<{ id: string; authorId: string; authorName: string; body: string; createdAt: string; updatedAt: string; mine: boolean }>;
  committeeLabels: string[]; permissions: { edit: boolean; labels: boolean; comment: boolean };
};
export type ReviewHistory = {
  submissions: Array<{ id: string; submittedAt: string; submittedBy: string; assigneeName: string; dueAt: string | null; onTime: boolean | null;
    resolution: 'pending' | 'approved' | 'rejected' | 'withdrawn'; resolvedAt: string | null; resolvedBy: string | null; reason: string | null }>;
  reopens: Array<{ id: string; createdAt: string; actorName: string; reason: string }>;
};

export type ReportTask = {
  id: string; title: string; committeeId: string; committeeName: string; personId: string; personName: string;
  status: TaskStatus; dueAt: string | null; submittedAt: string | null; completedAt: string | null; timing: Timing; rejections: number; reopens: number; links: Array<{ url: string; label: string }>;
};
export type Breakdown = { id: string; name: string; summary: Summary };
export type PersonReport = {
  generatedAt: string; person: { id: string; name: string; active: boolean };
  committees: Array<{ id: string; name: string; role: CommitteeRole; archivedAt: string | null }>;
  summary: Summary; byCommittee: Breakdown[]; tasks: ReportTask[];
};
export type CommitteeReport = {
  generatedAt: string; committee: { id: string; name: string; archivedAt: string | null }; memberCount: number;
  summary: Summary; byPerson: Array<Breakdown & { role: CommitteeRole | null; active: boolean }>; tasks: ReportTask[];
};
export type OverviewReport = {
  generatedAt: string; memberCount: number; committeeCount: number; summary: Summary;
  byCommittee: Array<Breakdown & { archivedAt: string | null }>; byPerson: Breakdown[];
};
