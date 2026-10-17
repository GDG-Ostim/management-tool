import { EmailLink } from './EmailLink';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Archive, CalendarClock, Flag, GripVertical, MoreHorizontal, Plus, RefreshCw, Search, Undo2, UsersRound } from 'lucide-react';
import { api, ApiError, errorMessage, type Committee, type CommitteeDetail, type Priority, type Task, type TaskStatus } from './api';
import { Avatar, Badge, Button, Dialog, EmptyState, ScrollFade, Toast, type ToastMessage } from './ui';
import type { Me } from './Dashboard';
import { TaskDetails } from './TaskDetails';

const columns: Array<{ status: TaskStatus; label: string; tone: string }> = [
  { status: 'todo', label: 'Yapılacak', tone: 'gray' },
  { status: 'in_progress', label: 'Devam ediyor', tone: 'blue' },
  { status: 'in_review', label: 'İncelemede', tone: 'yellow' },
  { status: 'done', label: 'Tamamlandı', tone: 'green' },
];
const statusLabel = Object.fromEntries(columns.map(column => [column.status, column.label])) as Record<TaskStatus, string>;
const priorityLabel: Record<Priority, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek' };
const dayFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const ALL = 'all';

type Reason = { task: Task; status: TaskStatus; kind: 'reject' | 'reopen' } | null;

function moveLabel(task: Task, status: TaskStatus, me: Me) {
  if (task.status === 'in_review' && status === 'in_progress') return task.assigneeId === me.id ? 'Teslimi geri çek' : 'Reddet ve geri gönder';
  if (task.status === 'done') return 'Yeniden aç';
  if (status === 'in_review') return 'İncelemeye gönder';
  if (status === 'done') return 'Onayla ve tamamla';
  return `${statusLabel[status]} sütununa taşı`;
}

const needsReason = (task: Task, status: TaskStatus, me: Me): Reason => {
  if (task.status === 'done' && status === 'in_progress') return { task, status, kind: 'reopen' };
  if (task.status === 'in_review' && status === 'in_progress' && task.assigneeId !== me.id) return { task, status, kind: 'reject' };
  return null;
};

function Due({ task }: { task: Task }) {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const late = task.status !== 'done' && due.getTime() < Date.now();
  return <span className={late ? 'task-due is-late' : 'task-due'}><CalendarClock size={14} />{late ? `Gecikti · ${dayFormat.format(due)}` : dayFormat.format(due)}</span>;
}

function CardMenu({ task, me, move }: { task: Task; me: Me; move(status: TaskStatus): void }) {
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
  const [up, setUp] = useState(false);
  if (!task.permissions.moves.length) return null;
  const toggle = () => {
    const anchor = ref.current;
    if (!open && anchor) {
      // The board scrolls horizontally, which also clips vertically; open upward when space runs out.
      const bounds = anchor.closest('.scroll-fade-viewport')?.getBoundingClientRect();
      const floor = Math.min(bounds?.bottom ?? innerHeight, innerHeight);
      setUp(floor - anchor.getBoundingClientRect().bottom < task.permissions.moves.length * 40 + 20);
    }
    setOpen(value => !value);
  };
  return <div className="row-menu" ref={ref} onClick={event => event.stopPropagation()}>
    <Button size="icon" variant="ghost" className="card-menu-button" aria-label={`${task.title} durumunu değiştir`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><MoreHorizontal size={17} /></Button>
    {open && <div className={up ? 'row-menu-popover opens-up' : 'row-menu-popover'} role="menu">
      {task.permissions.moves.map(status => <button key={status} role="menuitem" className={status === 'in_progress' && task.status === 'in_review' && task.assigneeId !== me.id ? 'is-danger' : undefined}
        onClick={() => { setOpen(false); move(status); }}>{moveLabel(task, status, me)}</button>)}
    </div>}
  </div>;
}

function TaskCard({ task, me, showCommittee, open, move, dragStart, dragEnd }: { task: Task; me: Me; showCommittee: boolean; open(): void; move(status: TaskStatus): void; dragStart(): void; dragEnd(): void }) {
  const draggable = task.permissions.moves.length > 0;
  return <article className="task-card" draggable={draggable} onClick={open} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); dragStart(); }} onDragEnd={dragEnd}>
    <header>
      {showCommittee ? <span className="task-committee">{task.committeeName}</span> : <span />}
      <span className="task-card-tools">{draggable && <GripVertical className="drag-handle" size={15} aria-hidden="true" />}<CardMenu task={task} me={me} move={move} /></span>
    </header>
    <h3 tabIndex={0} role="button" aria-label={`${task.title} görevini aç`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}>{task.title}</h3>
    {task.returned && <span className="task-returned"><Undo2 size={13} />{task.returned === 'rejected' ? 'Düzeltme istendi' : 'Yeniden açıldı'}</span>}
    <footer>
      <span className="task-assignee"><Avatar name={task.assigneeName} size="small" /><span>{task.assigneeId === me.id ? `${task.assigneeName} (sen)` : task.assigneeName}<EmailLink email={task.assigneeEmail} /></span></span>
      <span className="task-meta">
        {task.priority !== 'normal' && <span className={`task-priority is-${task.priority}`}><Flag size={13} />{priorityLabel[task.priority]}</span>}
        <Due task={task} />
      </span>
    </footer>
  </article>;
}

function toDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
// A due date means the end of that local day.
const fromDateInput = (value: string) => value ? new Date(`${value}T23:59:59`).toISOString() : null;

function TaskDialog({ open, task, me, committees, defaultCommittee, close, saved, refreshed, archived }: {
  open: boolean; task: Task | null; me: Me; committees: Committee[]; defaultCommittee: string;
  close(): void; saved(task: Task | Task[], created: boolean): void; refreshed(task: Task): void; archived(task: Task): void;
}) {
  const writable = committees.filter(committee => !committee.archivedAt);
  const [committeeId, setCommitteeId] = useState('');
  const [detail, setDetail] = useState<CommitteeDetail | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCommitteeId(task?.committeeId ?? (defaultCommittee !== ALL ? defaultCommittee : writable[0]?.id ?? ''));
  }, [open, task]);
  useEffect(() => {
    if (!open || !committeeId) { setDetail(null); setSelectedAssignees([]); return; }
    let live = true;
    api<CommitteeDetail>(`/api/committees/${committeeId}`).then(value => {
      if (live) {
        setDetail(value);
        if (!task) {
          const activeMembers = value.members.filter(member => member.active);
          setSelectedAssignees(current => {
            const valid = current.filter(id => activeMembers.some(m => m.id === id));
            if (valid.length) return valid;
            return activeMembers.some(m => m.id === me.id) ? [me.id] : (activeMembers[0] ? [activeMembers[0].id] : []);
          });
        }
      }
    }).catch(() => { if (live) { setDetail(null); setSelectedAssignees([]); } });
    return () => { live = false; };
  }, [open, committeeId, task, me.id]);

  const manage = task ? task.permissions.manage : me.role === 'super_admin' || committees.find(item => item.id === committeeId)?.myRole === 'lead';
  const editable = !task || task.permissions.edit;
  const members = (detail?.members ?? []).filter(member => member.active);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { title: String(data.get('title')).trim(), description: String(data.get('description') ?? '').trim() };
    if (manage || !task) {
      if (data.has('priority')) body.priority = data.get('priority');
      if (data.has('dueAt')) body.dueAt = fromDateInput(String(data.get('dueAt')));
    }
    if (task) {
      if (manage && data.has('assigneeId')) body.assigneeId = data.get('assigneeId');
    } else {
      if (manage) {
        if (!selectedAssignees.length) {
          setError('En az bir sorumlu seçmelisiniz.');
          return;
        }
        body.assigneeIds = selectedAssignees;
      } else {
        body.assigneeId = me.id;
      }
    }
    setPending(true); setError(null);
    try {
      const result = task
        ? await api<Task>(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, version: task.version }) })
        : await api<Task | Task[]>('/api/tasks', { method: 'POST', body: JSON.stringify({ ...body, committeeId }) });
      saved(result, !task);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'VERSION_CONFLICT' && reason.current) refreshed(reason.current as Task);
      setError(errorMessage(reason, 'Görev kaydedilemedi.'));
    } finally { setPending(false); }
  }

  async function archive() {
    if (!task || !confirm(`“${task.title}” arşivlensin mi? Panodan kalkar; tamamlanmış işse raporlarda kalmaya devam eder.`)) return;
    setPending(true); setError(null);
    try {
      await api(`/api/tasks/${task.id}/archive`, { method: 'POST', body: JSON.stringify({ version: task.version }) });
      archived(task);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'VERSION_CONFLICT' && reason.current) refreshed(reason.current as Task);
      setError(errorMessage(reason, 'Görev arşivlenemedi.'));
    } finally { setPending(false); }
  }

  const lockNote = task?.status === 'in_review' ? 'İncelemedeki görev kilitlidir; değiştirmek için teslim geri çekilmeli.'
    : task?.status === 'done' ? 'Tamamlanan görev kilitlidir; düzeltme için komite başkanı yeniden açmalı.'
    : task && !editable ? 'Bu görevi yalnız sorumlusu veya komite başkanı düzenleyebilir.' : null;

  const allSelected = members.length > 0 && members.every(member => selectedAssignees.includes(member.id));

  const form = <form className="dialog-form task-form" onSubmit={submit} key={task ? `${task.id}-${task.version}` : `new-${committeeId}`}>
    {lockNote && <p className="form-note">{lockNote}</p>}
    {!task && <label className="ui-field"><span>Komite</span>
      <select className="ui-input" value={committeeId} onChange={event => setCommitteeId(event.target.value)} required>
        {writable.map(committee => <option key={committee.id} value={committee.id}>{committee.name}</option>)}
      </select></label>}
    <label className="ui-field"><span>Başlık</span><input className="ui-input" name="title" required maxLength={160} defaultValue={task?.title} disabled={!editable} data-autofocus /></label>
    <label className="ui-field"><span>Açıklama</span><textarea className="ui-input" name="description" rows={4} maxLength={10000} defaultValue={task?.description} disabled={!editable} placeholder="Kısa bağlam, beklenen çıktı veya bağlantılar" /></label>
    {task ? (
      <div className="form-grid">
        <label className="ui-field"><span>Sorumlu</span>
          {manage && editable
            ? <select className="ui-input" name="assigneeId" defaultValue={task.assigneeId} key={`${committeeId}-${members.length}`} required>
                {!members.some(member => member.id === task.assigneeId) && <option value="" disabled>Seç</option>}
                {members.map(member => <option key={member.id} value={member.id}>{member.name}{member.id === me.id ? ' (sen)' : ''} · {member.email}</option>)}
              </select>
            : <input className="ui-input" value={task.assigneeName} disabled readOnly />}
        </label>
        <label className="ui-field"><span>Öncelik</span>
          <select className="ui-input" name="priority" defaultValue={task.priority} disabled={!editable || !manage}>
            {(Object.keys(priorityLabel) as Priority[]).map(value => <option key={value} value={value}>{priorityLabel[value]}</option>)}
          </select></label>
        <label className="ui-field"><span>Son tarih</span><input className="ui-input" type="date" name="dueAt" defaultValue={toDateInput(task.dueAt)} disabled={!editable || !manage} /></label>
      </div>
    ) : (
      <>
        <div className="form-grid is-two-cols">
          <label className="ui-field"><span>Öncelik</span>
            <select className="ui-input" name="priority" defaultValue="normal">
              {(Object.keys(priorityLabel) as Priority[]).map(value => <option key={value} value={value}>{priorityLabel[value]}</option>)}
            </select></label>
          <label className="ui-field"><span>Son tarih</span><input className="ui-input" type="date" name="dueAt" /></label>
        </div>
        {manage && editable ? (
          <div className="ui-field">
            <div className="assignee-field-header">
              <span>Sorumlular {members.length > 0 && <small>({selectedAssignees.length}/{members.length} seçildi)</small>}</span>
              {members.length > 0 && (
                <button
                  type="button"
                  className="assignee-all-btn"
                  onClick={() => setSelectedAssignees(allSelected ? [] : members.map(m => m.id))}
                >
                  {allSelected ? 'Seçimi temizle' : 'Herkese ata'}
                </button>
              )}
            </div>
            <div className="assignee-list" role="group" aria-label="Sorumlu üyeler">
              {members.length === 0 ? (
                <p className="detail-empty">Bu komitede aktif üye bulunmuyor.</p>
              ) : (
                members.map(member => {
                  const isChecked = selectedAssignees.includes(member.id);
                  return (
                    <label key={member.id} className={`assignee-item ${isChecked ? 'is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedAssignees(current =>
                            current.includes(member.id)
                              ? current.filter(id => id !== member.id)
                              : [...current, member.id]
                          );
                        }}
                      />
                      <span className="assignee-name">
                        {member.name}{member.id === me.id ? ' (sen)' : ''}
                      </span>
                      <span className="assignee-email">· {member.email}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <label className="ui-field"><span>Sorumlu</span>
            <input className="ui-input" value={`${me.name} (sen)`} disabled readOnly />
          </label>
        )}
      </>
    )}
    {task && <div className="task-contact"><span>Sorumlu: {task.assigneeName}</span><EmailLink email={task.assigneeEmail} /></div>}
    {task && !manage && editable && <small className="form-hint">Sorumlu, öncelik ve son tarihi komite başkanı değiştirir.</small>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer>{task && manage && <Button className="archive-button" variant="ghost" onClick={() => void archive()} disabled={pending}><Archive size={16} />Arşivle</Button>}
      <Button variant="ghost" onClick={close} disabled={pending}>{editable ? 'Vazgeç' : 'Kapat'}</Button>
      {editable && <Button type="submit" variant="primary" disabled={pending || !committeeId}>{pending ? 'Kaydediliyor…' : task ? 'Kaydet' : selectedAssignees.length > 1 ? `${selectedAssignees.length} kişiye görevi ata` : 'Görevi oluştur'}</Button>}</footer>
  </form>;

  return <Dialog open={open} title={task ? (editable ? 'Görevi düzenle' : 'Görev') : 'Yeni görev'} description={task ? `${task.committeeName} · ${statusLabel[task.status]}` : 'Başlık ve sorumlu zorunludur; diğer alanlar isteğe bağlıdır.'} onClose={close} busy={pending} wide={!!task}>
    {task ? <div className="task-layout">{form}<TaskDetails taskId={task.id} version={task.version} /></div> : form}
  </Dialog>;
}

export function Board({ me }: { me: Me }) {
  const admin = me.role === 'super_admin';
  const [committees, setCommittees] = useState<Committee[] | null>(null);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get('komite') ?? '');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState<Reason>(null);
  const [reasonPending, setReasonPending] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [linkedTaskId] = useState(() => new URLSearchParams(location.search).get('gorev'));

  useEffect(() => {
    const id = linkedTaskId;
    if (!id) return;
    let live = true;
    api<Task>(`/api/tasks/${encodeURIComponent(id)}`).then(task => {
      if (live) {
        setEditing(task);
        const url = new URL(location.href); url.searchParams.delete('gorev'); history.replaceState(null, '', url);
      }
    }, reason => { if (live) setToast({ tone: 'error', text: errorMessage(reason, 'Görev açılamadı.') }); });
    return () => { live = false; };
  }, [linkedTaskId]);

  useEffect(() => {
    api<Committee[]>('/api/committees').then(list => {
      const active = list.filter(item => !item.archivedAt);
      setCommittees(list);
      setSelected(current => current === ALL && admin ? ALL
        : active.some(item => item.id === current) ? current : admin || active.length > 1 ? ALL : active[0]?.id ?? '');
    }).catch(reason => setLoadError(errorMessage(reason, 'Komiteler yüklenemedi.')));
  }, []);

  const loadTasks = useCallback(async () => {
    if (!selected) return;
    setLoadError(null);
    try { setTasks(await api<Task[]>(selected === ALL ? '/api/tasks' : `/api/tasks?committeeId=${encodeURIComponent(selected)}`)); }
    catch (reason) { setLoadError(errorMessage(reason, 'Görevler yüklenemedi.')); }
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    setTasks(null); void loadTasks();
    const url = new URL(location.href);
    if (selected === ALL) url.searchParams.delete('komite'); else url.searchParams.set('komite', selected);
    history.replaceState(null, '', url);
  }, [selected, loadTasks]);

  const active = (committees ?? []).filter(item => !item.archivedAt);
  const current = active.find(item => item.id === selected);
  const canCreate = selected === ALL ? active.length > 0 : !!current;
  const people = useMemo(() => [...new Map((tasks ?? []).map(task => [task.assigneeId, `${task.assigneeName} · ${task.assigneeEmail}`])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'tr')), [tasks]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR');
    return (tasks ?? []).filter(task => (!assignee || task.assigneeId === assignee)
      && (!needle || task.title.toLocaleLowerCase('tr-TR').includes(needle)));
  }, [tasks, query, assignee]);

  const replace = (task: Task) => setTasks(list => list ? (list.some(item => item.id === task.id) ? list.map(item => item.id === task.id ? task : item) : [task, ...list]) : list);

  async function transition(task: Task, status: TaskStatus, why?: string) {
    replace({ ...task, status });
    try {
      const next = await api<Task>(`/api/tasks/${task.id}/transition`, { method: 'POST', body: JSON.stringify({ status, version: task.version, ...(why ? { reason: why } : {}) }) });
      replace(next);
      if (status === 'done') setToast({ tone: 'success', text: `“${next.title}” onaylandı ve tamamlandı.`, image: '/mascot/celebrate.png' });
      else if (status === 'in_review') setToast({ tone: 'success', text: `“${next.title}” incelemeye gönderildi.` });
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'VERSION_CONFLICT' && reason.current) replace(reason.current as Task);
      else replace(task);
      if (why) throw reason;
      setToast({ tone: 'error', text: errorMessage(reason, 'Görev taşınamadı.') });
      return false;
    }
  }

  function requestMove(task: Task, status: TaskStatus) {
    if (task.status === status || !task.permissions.moves.includes(status)) return;
    const ask = needsReason(task, status, me);
    if (ask) { setReasonError(null); setReason(ask); return; }
    void transition(task, status);
  }

  async function submitReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) return;
    const text = String(new FormData(event.currentTarget).get('reason')).trim();
    setReasonPending(true); setReasonError(null);
    try { await transition(reason.task, reason.status, text); setReason(null); }
    catch (failure) { setReasonError(errorMessage(failure, 'İşlem tamamlanamadı.')); }
    finally { setReasonPending(false); }
  }

  const drop = (status: TaskStatus) => (event: DragEvent) => {
    event.preventDefault(); setOver(null);
    const task = tasks?.find(item => item.id === event.dataTransfer.getData('text/plain')) ?? dragging;
    setDragging(null);
    if (task) requestMove(task, status);
  };
  const accepts = (status: TaskStatus) => !!dragging && dragging.permissions.moves.includes(status);

  if (committees && !active.length) return <>
    <div className="page-title-row"><div><h1>Panolar</h1><p>Komite görevlerini dört sütunda takip et.</p></div></div>
    <div className="ui-card"><EmptyState icon={<UsersRound size={23} />} title={admin ? 'Henüz komite yok' : 'Henüz bir komitede değilsin'}
      description={admin ? 'Panoyu kullanmak için önce bir komite oluştur ve üyelerini ekle.' : 'Başkan seni bir komiteye eklediğinde panon burada açılır.'}
      action={admin ? <Button variant="primary" onClick={() => location.assign('/komiteler')}>Komite oluştur</Button> : undefined} /></div>
  </>;

  return <>
    <div className="page-title-row">
      <div><h1>Panolar</h1><p>{current ? `${current.name} komitesinin görevleri` : admin ? 'Bütün komitelerin görevleri' : 'Dahil olduğun komitelerin görevleri'}</p></div>
      <Button variant="primary" onClick={() => setCreating(true)} disabled={!canCreate}><Plus size={18} />Görev ekle</Button>
    </div>
    <div className="board-toolbar">
      <label className="board-select"><span className="sr-only">Komite</span>
        <select className="ui-input" value={selected} onChange={event => { setSelected(event.target.value); setAssignee(''); }}>
          {(admin || active.length > 1) && <option value={ALL}>{admin ? 'Tüm komiteler' : 'Tüm komitelerim'}</option>}
          {active.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      <label className="search-field"><Search size={17} aria-hidden="true" /><input type="search" placeholder="Görev ara" aria-label="Görev ara" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="board-select"><span className="sr-only">Sorumlu</span>
        <select className="ui-input" value={assignee} onChange={event => setAssignee(event.target.value)}>
          <option value="">Herkes</option>
          <option value={me.id}>Bana atananlar</option>
          {people.filter(([id]) => id !== me.id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
    </div>
    {loadError ? <div className="ui-card"><EmptyState icon={<RefreshCw size={22} />} title="Pano yüklenemedi" description={loadError} action={<Button onClick={() => void loadTasks()}>Yeniden dene</Button>} /></div>
      : <ScrollFade className="board" label="Pano sütunları" aria-busy={!tasks}>
        {columns.map(column => {
          const items = visible.filter(task => task.status === column.status);
          return <section key={column.status} className={['board-column', accepts(column.status) && 'can-drop', over === column.status && accepts(column.status) && 'is-over'].filter(Boolean).join(' ')}
            aria-label={column.label}
            onDragOver={event => { if (accepts(column.status)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(column.status); } }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null); }}
            onDrop={drop(column.status)}>
            <header><Badge tone={column.tone as 'gray'}>{column.label}</Badge><span className="column-count">{tasks ? items.length : '–'}</span></header>
            <div className="board-cards">
              {!tasks ? [0, 1].map(index => <i key={index} className="card-skeleton" />)
                : items.map(task => <TaskCard key={task.id} task={task} me={me} showCommittee={selected === ALL} open={() => setEditing(task)}
                  move={status => requestMove(task, status)} dragStart={() => setDragging(task)} dragEnd={() => { setDragging(null); setOver(null); }} />)}
              {tasks && !items.length && (column.status === 'todo' && !visible.length
                ? <div className="column-empty is-mascot"><img src="/mascot/empty.png" alt="" /><strong>Henüz görev yok</strong><span>{query || assignee ? 'Filtreye uyan görev bulunamadı.' : 'İlk görevi ekleyerek panoyu başlat.'}</span></div>
                : <div className="column-empty">{accepts(column.status) ? 'Buraya bırak' : 'Görev yok'}</div>)}
            </div>
          </section>;
        })}
      </ScrollFade>}
    <TaskDialog open={creating || !!editing} task={editing} me={me} committees={active} defaultCommittee={selected}
      close={() => { setCreating(false); setEditing(null); }}
      saved={(result, created) => {
        const items = Array.isArray(result) ? result : [result];
        setTasks(list => {
          if (!list) return list;
          let current = list;
          for (const item of items) {
            current = current.some(t => t.id === item.id)
              ? current.map(t => t.id === item.id ? item : t)
              : [item, ...current];
          }
          return current;
        });
        setCreating(false); setEditing(null);
        setToast({
          tone: 'success',
          text: created
            ? items.length > 1
              ? `${items.length} görev oluşturuldu.`
              : `“${items[0]?.title}” oluşturuldu.`
            : `“${items[0]?.title}” güncellendi.`
        });
      }}
      refreshed={task => { replace(task); setEditing(task); }}
      archived={task => {
        setTasks(list => list?.filter(item => item.id !== task.id) ?? list); setEditing(null);
        setToast({ tone: 'success', text: `“${task.title}” arşivlendi.` });
      }} />
    <Dialog open={!!reason} title={reason?.kind === 'reopen' ? 'Görevi yeniden aç' : 'Teslimi reddet'}
      description={reason?.kind === 'reopen' ? 'Görev Devam ediyor sütununa döner; tamamlanma kaydı korunur.' : 'Görev sorumluya Devam ediyor olarak döner. Gerekçe inceleme geçmişinde saklanır.'}
      onClose={() => setReason(null)} busy={reasonPending}>
      <form className="dialog-form" onSubmit={submitReason}>
        <label className="ui-field"><span>Gerekçe</span><textarea className="ui-input" name="reason" rows={3} required maxLength={1000} data-autofocus placeholder={reason?.kind === 'reopen' ? 'Neden yeniden açılıyor?' : 'Neyin düzeltilmesi gerekiyor?'} /></label>
        {reasonError && <p className="form-error" role="alert">{reasonError}</p>}
        <footer><Button variant="ghost" onClick={() => setReason(null)} disabled={reasonPending}>Vazgeç</Button>
          <Button type="submit" variant={reason?.kind === 'reject' ? 'danger' : 'primary'} disabled={reasonPending}>{reasonPending ? 'Kaydediliyor…' : reason?.kind === 'reopen' ? 'Yeniden aç' : 'Reddet'}</Button></footer>
      </form>
    </Dialog>
    <Toast toast={toast} close={closeToast} />
  </>;
}
