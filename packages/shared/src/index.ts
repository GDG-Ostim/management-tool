// Types shared by the API and the web app. Import with `import type` only: the package has no runtime build.

export type GlobalRole = 'super_admin' | 'user';
export type CommitteeRole = 'lead' | 'member';
export type InvitationState = 'pending' | 'sent' | 'failed' | 'accepted';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type Priority = 'low' | 'normal' | 'high';

/** Report timing of one task: completed work by its approved submission, open work by the current deadline. */
export type Timing = 'on_time' | 'late' | 'undated' | 'overdue' | null;
export interface Summary { completed: number; onTime: number; late: number; undated: number; openOverdue: number; overdueTotal: number; inReview: number; open: number }

export interface MemberProfile {
  id: string;
  name: string;
  email: string;
  role: GlobalRole;
  onboardingCompletedAt: string | null;
  leadsCommittee: boolean;
}

/** Every API error uses this body; `current` carries the latest record on a version conflict. */
export interface ApiFailure {
  error: { code: string; message: string };
  current?: unknown;
}
