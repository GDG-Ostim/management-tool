import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, FolderKanban, Pencil, Plus, RefreshCw, UserMinus, UsersRound } from 'lucide-react';
import { api, errorMessage, type Committee, type CommitteeDetail, type CommitteeRole } from './api';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Field, Toast, type ToastMessage } from './ui';

type UserOption = { id: string; name: string; email: string; active: boolean };
const roleLabel: Record<CommitteeRole, string> = { lead: 'Komite başkanı', member: 'Üye' };

/** Creates a committee, or edits name and description when `committee` is given. */
function CommitteeDialog({ open, committee, close, saved }: { open: boolean; committee?: CommitteeDetail; close(): void; saved(committee: CommitteeDetail): void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    setPending(true); setError(null);
    try {
      const body = JSON.stringify({ name: String(data.get('name')).trim(), description: String(data.get('description')).trim() });
      const result = committee
        ? await api<CommitteeDetail>(`/api/committees/${committee.id}`, { method: 'PATCH', body })
        : await api<CommitteeDetail>('/api/committees', { method: 'POST', body });
      form.reset(); saved(result);
    } catch (reason) { setError(errorMessage(reason, committee ? 'Komite güncellenemedi.' : 'Komite oluşturulamadı.')); }
    finally { setPending(false); }
  }
  return <Dialog open={open} title={committee ? 'Komiteyi düzenle' : 'Komite oluştur'} description={committee ? 'Ad ve açıklama panolarda ve raporlarda hemen güncellenir.' : 'Komite oluşturulduktan sonra üyelerini ve komite başkanını ekleyebilirsin.'} onClose={close} busy={pending}>
    <form className="dialog-form" onSubmit={submit} key={committee ? `${committee.id}-${committee.name}` : 'new'}>
      <Field label="Komite adı" name="name" required maxLength={80} autoComplete="off" data-autofocus placeholder="Örn. Etkinlik" defaultValue={committee?.name} />
      <label className="ui-field"><span>Açıklama</span><textarea className="ui-input" name="description" rows={3} maxLength={500} placeholder="Komitenin kısa sorumluluk alanı" defaultValue={committee?.description} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><Button variant="ghost" onClick={close} disabled={pending}>Vazgeç</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Kaydediliyor…' : committee ? 'Kaydet' : 'Oluştur'}</Button></footer>
    </form>
  </Dialog>;
}

function CommitteePanel({ id, users, changed, notify }: { id: string; users: UserOption[]; changed(committee: CommitteeDetail): void; notify(toast: ToastMessage): void }) {
  const [detail, setDetail] = useState<CommitteeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDetail(null); setError(null);
    api<CommitteeDetail>(`/api/committees/${id}`).then(setDetail).catch(reason => setError(errorMessage(reason, 'Komite yüklenemedi.')));
  }, [id]);

  async function run(request: Promise<CommitteeDetail>, success: string) {
    setBusy(true);
    try { const next = await request; setDetail(next); changed(next); notify({ tone: 'success', text: success }); }
    catch (reason) { notify({ tone: 'error', text: errorMessage(reason, 'İşlem tamamlanamadı.') }); }
    finally { setBusy(false); }
  }
  const setRole = (userId: string, role: CommitteeRole, success: string) =>
    run(api(`/api/committees/${id}/members/${userId}`, { method: 'PUT', body: JSON.stringify({ role }) }), success);

  if (error) return <Card className="committee-panel"><EmptyState icon={<RefreshCw size={22} />} title="Komite yüklenemedi" description={error} /></Card>;
  if (!detail) return <Card className="committee-panel"><div className="users-skeleton">{[0, 1, 2].map(index => <i key={index} />)}</div></Card>;
  const memberIds = new Set(detail.members.map(member => member.id));
  const candidates = users.filter(user => user.active && !memberIds.has(user.id));
  const archived = !!detail.archivedAt;

  return <Card className="committee-panel">
    <header className="committee-panel-head">
      <div><h2>{detail.name}{archived && <Badge>Arşivde</Badge>}</h2><p>{detail.description || 'Açıklama eklenmemiş.'}</p></div>
      <span className="committee-actions">
        <Button variant="ghost" disabled={busy} onClick={() => setEditing(true)}><Pencil size={16} />Düzenle</Button>
        {!archived && <Button onClick={() => location.assign(`/panolar?komite=${detail.id}`)}><FolderKanban size={17} />Panoyu aç</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => void run(api(`/api/committees/${id}`, { method: 'PATCH', body: JSON.stringify({ archived: !archived }) }), archived ? `${detail.name} arşivden çıkarıldı.` : `${detail.name} arşivlendi.`)}>
          {archived ? <><ArchiveRestore size={17} />Arşivden çıkar</> : <><Archive size={17} />Arşivle</>}
        </Button>
      </span>
    </header>
    <h3 className="panel-subtitle">Üyeler <span>{detail.members.length}</span></h3>
    {detail.members.length ? <ul className="member-list">
      {detail.members.map(member => <li key={member.id} className={member.active ? undefined : 'is-inactive'}>
        <span className="user-cell"><Avatar name={member.name} size="small" /><span><strong>{member.name}</strong>{!member.active && <small>Pasif hesap</small>}</span></span>
        <span className="member-controls">
          <select className="ui-input" aria-label={`${member.name} komite rolü`} value={member.role} disabled={busy || archived}
            onChange={event => void setRole(member.id, event.target.value as CommitteeRole, `${member.name} artık ${roleLabel[event.target.value as CommitteeRole].toLocaleLowerCase('tr-TR')}.`)}>
            <option value="member">Üye</option><option value="lead">Komite başkanı</option>
          </select>
          <Button size="icon" variant="ghost" aria-label={`${member.name} kişisini komiteden çıkar`} disabled={busy}
            onClick={() => void run(api(`/api/committees/${id}/members/${member.id}`, { method: 'DELETE' }), `${member.name} komiteden çıkarıldı.`)}><UserMinus size={17} /></Button>
        </span>
      </li>)}
    </ul> : <p className="panel-empty">Henüz üye yok. Aşağıdan ilk üyeyi ekle.</p>}
    {!archived && <form className="member-add" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget); const userId = String(data.get('userId'));
      const user = users.find(item => item.id === userId);
      if (user) void setRole(userId, data.get('role') as CommitteeRole, `${user.name} komiteye eklendi.`);
    }}>
      <select className="ui-input" name="userId" aria-label="Eklenecek kişi" required defaultValue="" key={detail.members.length}>
        <option value="" disabled>{candidates.length ? 'Kişi seç' : 'Eklenebilecek aktif kullanıcı yok'}</option>
        {candidates.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
      </select>
      <select className="ui-input" name="role" aria-label="Komite rolü" defaultValue="member"><option value="member">Üye</option><option value="lead">Komite başkanı</option></select>
      <Button type="submit" disabled={busy || !candidates.length}><Plus size={17} />Ekle</Button>
    </form>}
    <CommitteeDialog open={editing} committee={detail} close={() => setEditing(false)}
      saved={next => { setEditing(false); setDetail(next); changed(next); notify({ tone: 'success', text: `${next.name} güncellendi.` }); }} />
  </Card>;
}

export function Committees() {
  const [committees, setCommittees] = useState<Committee[] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<ToastMessage>(null);
  const closeToast = useCallback(() => setToast(null), []);

  async function load() {
    setError(null);
    try {
      const [list, people] = await Promise.all([api<Committee[]>('/api/committees'), api<UserOption[]>('/api/users')]);
      setCommittees(list); setUsers(people);
      setSelected(current => current && list.some(item => item.id === current) ? current : list[0]?.id ?? null);
    } catch (reason) { setError(errorMessage(reason, 'Komiteler yüklenemedi.')); }
  }
  useEffect(() => { void load(); }, []);
  const merge = (next: Committee) => setCommittees(list => list?.map(item => item.id === next.id ? { ...item, ...next } : item) ?? null);

  return <>
    <div className="page-title-row">
      <div><h1>Komiteler</h1><p>Ekipleri oluştur, komite başkanlarını ve üyeleri belirle.</p></div>
      <Button variant="primary" onClick={() => setCreating(true)}><Plus size={18} />Komite oluştur</Button>
    </div>
    {error ? <Card><EmptyState icon={<RefreshCw size={22} />} title="Komiteler yüklenemedi" description={error} action={<Button onClick={() => void load()}>Yeniden dene</Button>} /></Card>
      : !committees ? <Card><div className="users-skeleton">{[0, 1, 2].map(index => <i key={index} />)}</div></Card>
      : !committees.length ? <Card><EmptyState icon={<UsersRound size={23} />} title="Henüz komite yok" description="İlk komiteyi oluşturup üyelerini ekleyerek panoları kullanmaya başla." action={<Button variant="primary" onClick={() => setCreating(true)}>Komite oluştur</Button>} /></Card>
      : <div className="committee-layout">
        <nav className="committee-list" aria-label="Komite listesi">
          {committees.map(item => <button key={item.id} aria-current={item.id === selected ? 'true' : undefined} className={item.archivedAt ? 'is-archived' : undefined} onClick={() => setSelected(item.id)}>
            <strong>{item.name}</strong>
            <span>{item.memberCount} üye · {item.openTasks} açık görev{item.archivedAt ? ' · Arşivde' : ''}</span>
          </button>)}
        </nav>
        {selected && <CommitteePanel id={selected} users={users} changed={merge} notify={setToast} />}
      </div>}
    <CommitteeDialog open={creating} close={() => setCreating(false)} saved={committee => {
      setCreating(false); setCommittees(list => [...(list ?? []), committee].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
      setSelected(committee.id); setToast({ tone: 'success', text: `${committee.name} komitesi oluşturuldu.` });
    }} />
    <Toast toast={toast} close={closeToast} />
  </>;
}
