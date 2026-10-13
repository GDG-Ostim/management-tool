export type GlobalRole = 'super_admin' | 'user';
export type InvitationState = 'pending' | 'sent' | 'failed' | 'accepted';
export interface MemberProfile {
  id: string;
  name: string;
  email: string;
  role: GlobalRole;
}
export interface ApiFailure {
  error: { code: string; message: string };
}
