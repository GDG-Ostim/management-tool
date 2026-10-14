import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MailCheck, MoreHorizontal, RefreshCw, Search, ShieldCheck, ShieldOff, UserCheck, UserPlus, UserX, UsersRound } from 'lucide-react';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Field, Toast, type ToastMessage } from './ui';
import type { InvitationState } from '@gdg/shared';
import type { Me } from './Dashboard';
import { api } from './api';

type Invitation = InvitationState;
type User = { id: string; name: string; email: string; role: Me['role']; active: boolean; invitation: Invitation; invitationSentAt: string | null; createdAt: string };
type Filter = 'all' | 'active' | 'invited' | 'inactive';
type Pending = { user: User; change: { role: Me['role'] } | { active: boolean } } | null;

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Tümü' }, { value: 'active', label: 'Aktif' }, { value: 'invited', label: 'Davetli' }, { value: 'inactive', label: 'Pasif' },
];

function group(user: User): Exclude<Filter, 'all'> {
  if (!user.active) return 'inactive';
  return user.invitation === 'accepted' ? 'active' : 'invited';
}

function Status({ user }: { user: User }) {
  if (!user.active) return <Badge>Pasif</Badge>;
  if (user.invitation === 'accepted') return <Badge tone="green">Aktif</Badge>;
  if (user.invitation === 'sent') return <Badge tone="blue">Davet gönderildi</Badge>;
  if (user.invitation === 'failed') return <Badge tone="red">Davet gönderilemedi</Badge>;
  return <Badge tone="yellow">Davet bekliyor</Badge>;
}

const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

function RowMenu({ user, busy, resend, request }: { user: User; busy: boolean; resend(): void; request(change: { role: Me['role'] } | { active: boolean }): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const run = (action: () => void) => () => { setOpen(false); action(); };
  const canInvite = user.active && user.invitation !== 'accepted';
  return <div className="row-menu" ref={ref}>
    <Button size="icon" variant="ghost" aria-label={`${user.name} için işlemler`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(value => !value)}>
      {busy ? <RefreshCw className="is-spinning" size={17} /> : <MoreHorizontal size={18} />}
    </Button>
    {open && <div className="row-menu-popover" role="menu">
      {canInvite && <button role="menuitem" onClick={run(resend)}><MailCheck size={16} />{user.invitation === 'failed' ? 'Daveti yeniden dene' : 'Daveti yeniden gönder'}</button>}
      {user.active && (user.role === 'super_admin'
        ? <button role="menuitem" onClick={run(() => request({ role: 'user' }))}><ShieldOff size={16} />Üye yap</button>
        : <button role="menuitem" onClick={run(() => request({ role: 'super_admin' }))}><ShieldCheck size={16} />Başkan yap</button>)}
      {user.active
        ? <button role="menuitem" className="is-danger" onClick={run(() => request({ active: false }))}><UserX size={16} />Pasifleştir</button>
        : <button role="menuitem" onClick={run(() => request({ active: true }))}><UserCheck size={16} />Yeniden etkinleştir</button>}
    </div>}
  </div>;
}

function AddUserDialog({ open, close, created }: { open: boolean; close(): void; created(user: { name: string; invitation: Invitation }): void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name')).trim(); const email = String(data.get('email')).trim();
    setPending(true); setError(null);
    try {
      const result = await api<{ invitation: Invitation }>('/api/users', { method: 'POST', body: JSON.stringify({ name, email }) });
      form.reset(); created({ name, invitation: result.invitation });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kullanıcı eklenemedi.'); }
    finally { setPending(false); }
  }
  return <Dialog open={open} title="Kullanıcı ekle" description="Kişi, e-postasına gelen bağlantıyla şifresini belirleyip giriş yapar." onClose={close} busy={pending}>
    <form className="dialog-form" onSubmit={submit}>
      <Field label="Ad soyad" name="name" autoComplete="off" required maxLength={100} data-autofocus />
      <Field label="E-posta" name="email" type="email" autoComplete="off" required maxLength={254} placeholder="ad@ornek.com" hint="Komite üyelikleri komite yönetiminden atanır." />
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><Button variant="ghost" onClick={close} disabled={pending}>Vazgeç</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Ekleniyor…' : 'Ekle ve davet gönder'}</Button></footer>
    </form>
  </Dialog>;
}

function confirmCopy({ user, change }: NonNullable<Pending>) {
  if ('role' in change) return change.role === 'super_admin'
    ? { title: 'Başkan yetkisi ver', text: `${user.name} bütün komiteleri, kullanıcıları ve raporları yönetebilecek.`, action: 'Başkan yap', danger: false }
    : { title: 'Başkan yetkisini kaldır', text: `${user.name} yalnız üyesi olduğu komitelerde çalışabilecek.`, action: 'Üye yap', danger: true };
  return change.active
    ? { title: 'Hesabı etkinleştir', text: `${user.name} yeniden giriş yapabilecek. Davet tamamlanmadıysa yeni davet göndermen gerekir.`, action: 'Etkinleştir', danger: false }
    : { title: 'Hesabı pasifleştir', text: `${user.name} hemen oturumdan çıkarılır ve giriş yapamaz. Görev ve rapor geçmişi korunur.`, action: 'Pasifleştir', danger: true };
}

export function Users({ me }: { me: Me }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);
  const closeToast = useCallback(() => setToast(null), []);

  async function load() {
    setLoadError(null);
    try { setUsers(await api<User[]>('/api/users')); }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Kullanıcılar yüklenemedi.'); }
  }
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, active: 0, invited: 0, inactive: 0 };
    for (const user of users ?? []) { result.all += 1; result[group(user)] += 1; }
    return result;
  }, [users]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR');
    return (users ?? []).filter(user => (filter === 'all' || group(user) === filter)
      && (!needle || `${user.name} ${user.email}`.toLocaleLowerCase('tr-TR').includes(needle)));
  }, [users, filter, query]);

  const replace = (next: User) => setUsers(list => list?.map(user => user.id === next.id ? next : user) ?? null);

  async function resend(user: User) {
    setBusyId(user.id);
    try {
      await api(`/api/users/${user.id}/invite`, { method: 'POST' });
      setToast({ tone: 'success', text: `${user.name} için davet e-postası gönderildi.` });
    } catch (reason) { setToast({ tone: 'error', text: reason instanceof Error ? reason.message : 'Davet gönderilemedi.' }); }
    finally { setBusyId(null); await load(); }
  }

  async function confirm() {
    if (!pending) return;
    setBusyId(pending.user.id); setConfirmError(null);
    try {
      const next = await api<User>(`/api/users/${pending.user.id}`, { method: 'PATCH', body: JSON.stringify(pending.change) });
      const change = pending.change;
      replace(next); setPending(null);
      setToast({ tone: 'success', text: 'role' in change
        ? `${next.name} artık ${change.role === 'super_admin' ? 'başkan' : 'üye'} rolünde.`
        : `${next.name} ${change.active ? 'yeniden etkinleştirildi' : 'pasifleştirildi; oturumları kapatıldı'}.` });
    } catch (reason) { setConfirmError(reason instanceof Error ? reason.message : 'Değişiklik kaydedilemedi.'); }
    finally { setBusyId(null); }
  }

  const copy = pending && confirmCopy(pending);
  return <>
    <div className="page-title-row">
      <div><h1>Kullanıcılar</h1><p>Ekip hesaplarını ekle, davetleri takip et ve erişimleri yönet.</p></div>
      <Button variant="primary" onClick={() => setAdding(true)}><UserPlus size={18} />Kullanıcı ekle</Button>
    </div>
    <Card className="users-card">
      <div className="users-toolbar">
        <div className="segmented" role="group" aria-label="Duruma göre filtrele">
          {filters.map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{counts[item.value]}</span></button>)}
        </div>
        <label className="search-field"><Search size={17} aria-hidden="true" /><input type="search" placeholder="Ad veya e-posta ara" aria-label="Ad veya e-posta ara" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      {loadError ? <EmptyState icon={<RefreshCw size={22} />} title="Kullanıcılar yüklenemedi" description={loadError} action={<Button onClick={() => void load()}>Yeniden dene</Button>} />
        : !users ? <div className="users-skeleton" aria-label="Kullanıcılar yükleniyor">{[0, 1, 2, 3].map(index => <i key={index} />)}</div>
        : !visible.length ? <EmptyState icon={<UsersRound size={23} />} title="Eşleşen kullanıcı yok" description="Filtreyi veya arama metnini değiştirerek yeniden dene." />
        : <table className="users-table">
          <thead><tr><th scope="col">Kişi</th><th scope="col">Rol</th><th scope="col">Durum</th><th scope="col">Eklenme</th><th scope="col"><span className="sr-only">İşlemler</span></th></tr></thead>
          <tbody>{visible.map(user => <tr key={user.id} className={user.active ? undefined : 'is-inactive'}>
            <td><div className="user-cell"><Avatar name={user.name} size="small" /><span><strong>{user.name}{user.id === me.id && <em>Sen</em>}</strong><small>{user.email}</small></span></div></td>
            <td data-label="Rol">{user.role === 'super_admin' ? <span className="role-label is-admin"><ShieldCheck size={15} />Başkan</span> : <span className="role-label">Üye</span>}</td>
            <td data-label="Durum"><Status user={user} /></td>
            <td data-label="Eklenme" className="muted">{dateFormat.format(new Date(user.createdAt))}</td>
            <td className="row-actions">{user.id !== me.id && <RowMenu user={user} busy={busyId === user.id} resend={() => void resend(user)} request={change => { setConfirmError(null); setPending({ user, change }); }} />}</td>
          </tr>)}</tbody>
        </table>}
    </Card>
    <AddUserDialog open={adding} close={() => setAdding(false)} created={({ name, invitation }) => {
      setAdding(false); void load();
      setToast(invitation === 'sent'
        ? { tone: 'success', text: `${name} eklendi; şifre belirleme bağlantısı gönderildi.` }
        : { tone: 'error', text: `${name} eklendi ancak davet gönderilemedi. İşlem menüsünden yeniden deneyebilirsin.` });
    }} />
    <Dialog open={!!pending} title={copy?.title ?? ''} description={copy?.text} onClose={() => setPending(null)} busy={!!busyId}>
      <div className="dialog-form">
        {confirmError && <p className="form-error" role="alert">{confirmError}</p>}
        <footer><Button variant="ghost" onClick={() => setPending(null)} disabled={!!busyId}>Vazgeç</Button>
          <Button variant={copy?.danger ? 'danger' : 'primary'} onClick={() => void confirm()} disabled={!!busyId} data-autofocus>{busyId ? 'Kaydediliyor…' : copy?.action}</Button></footer>
      </div>
    </Dialog>
    <Toast toast={toast} close={closeToast} />
  </>;
}
