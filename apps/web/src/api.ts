export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '', public current?: unknown) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init?.body ? { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } } : init);
  } catch { throw new ApiError('Bağlantı kurulamadı. İnternet bağlantını kontrol edip yeniden dene.'); }
  if (response.status === 401) { location.assign('/giris'); throw new ApiError('Oturumun sona erdi.', 401); }
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; current?: unknown } | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? 'İşlem tamamlanamadı.', response.status, body?.error?.code, body?.current);
  return body as T;
}

export const errorMessage = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export type CommitteeRole = 'lead' | 'member';
export type Committee = { id: string; name: string; description: string; archivedAt: string | null; myRole: CommitteeRole | null; memberCount: number; openTasks: number };
export type CommitteeMember = { id: string; name: string; role: CommitteeRole; active: boolean };
export type CommitteeDetail = Committee & { members: CommitteeMember[] };
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type Priority = 'low' | 'normal' | 'high';
export type Task = {
  id: string; committeeId: string; committeeName: string; title: string; description: string;
  assigneeId: string; assigneeName: string; createdBy: string; status: TaskStatus; priority: Priority;
  dueAt: string | null; version: number; createdAt: string; updatedAt: string; completedAt: string | null;
  permissions: { edit: boolean; manage: boolean; moves: TaskStatus[] };
};
