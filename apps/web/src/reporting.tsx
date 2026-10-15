import { EmailLink } from './EmailLink';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Clock3, ListTodo, RotateCw, TriangleAlert } from 'lucide-react';
import { api, ApiError, type Breakdown, type ReportTask, type Summary, type TaskStatus, type Timing } from './api';
import { Badge, Button, Card, EmptyState } from './ui';

/** Loads one GET endpoint; a null path waits without requesting. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState({ data: null, error: null });
    api<T>(path).then(
      data => { if (live) setState({ data, error: null }); },
      reason => { if (live) setState({ data: null, error: reason instanceof ApiError ? reason : new ApiError('Veriler yüklenemedi.') }); },
    );
    return () => { live = false; };
  }, [path, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

export function LoadError({ error, retry }: { error: ApiError; retry(): void }) {
  const missing = error.status === 404 || error.status === 403;
  return <Card><EmptyState icon={<TriangleAlert size={22} />} title={missing ? 'Rapor bulunamadı' : 'Rapor yüklenemedi'}
    description={missing ? 'Bu kayıt yok ya da görüntüleme yetkin bulunmuyor.' : error.message}
    action={missing ? <Button onClick={() => location.assign('/raporlar')}>Raporlara dön</Button> : <Button onClick={retry}><RotateCw size={16} />Yeniden dene</Button>} /></Card>;
}

// Times are stored in UTC and always shown in Istanbul time.
const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
export const formatDate = (value: string | null) => value ? dateFormat.format(new Date(value)) : '—';
export const formatDateTime = (value: string | null) => value ? dateTimeFormat.format(new Date(value)) : '—';

export const statusLabel: Record<TaskStatus, string> = { todo: 'Yapılacak', in_progress: 'Devam ediyor', in_review: 'İncelemede', done: 'Tamamlandı' };
const statusTone: Record<TaskStatus, 'gray' | 'blue' | 'yellow' | 'green'> = { todo: 'gray', in_progress: 'blue', in_review: 'yellow', done: 'green' };

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export function TimingBadge({ timing }: { timing: Timing }) {
  if (timing === 'on_time') return <Badge tone="green">Zamanında</Badge>;
  if (timing === 'late') return <Badge tone="red">Geç bitti</Badge>;
  if (timing === 'overdue') return <Badge tone="red">Gecikti</Badge>;
  if (timing === 'undated') return <Badge>Tarihsiz</Badge>;
  return <span className="muted">—</span>;
}

export function SummaryCards({ summary }: { summary: Summary | null }) {
  const cards: Array<{ label: string; value?: number; hint?: string; icon: typeof ListTodo; tone: string }> = [
    { label: 'Açık işler', value: summary?.open, hint: 'Yapılacak ve devam eden', icon: ListTodo, tone: 'blue' },
    { label: 'İncelemede', value: summary?.inReview, hint: 'Onay bekleyen teslimler', icon: Clock3, tone: 'yellow' },
    { label: 'Tamamlanan', value: summary?.completed, hint: summary ? `${summary.onTime} zamanında · ${summary.late} geç · ${summary.undated} tarihsiz` : undefined, icon: CheckCircle2, tone: 'green' },
    { label: 'Geciken', value: summary?.overdueTotal, hint: summary ? `${summary.openOverdue} açık · ${summary.late} geç biten` : undefined, icon: TriangleAlert, tone: 'red' },
  ];
  return <div className="metric-grid" aria-label="Görev özeti" aria-busy={!summary}>
    {cards.map(({ label, value, hint, icon: MetricIcon, tone }) => <Card className={`metric-card tone-${tone}`} key={label}>
      <span className="metric-icon"><MetricIcon size={20} strokeWidth={1.9} /></span>
      <div><span>{label}</span><strong>{value ?? '–'}</strong>{hint && <small>{hint}</small>}</div>
    </Card>)}
  </div>;
}

type TaskFilter = 'all' | 'open' | 'in_review' | 'done';
const taskFilters: Array<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: 'Tümü' }, { value: 'open', label: 'Açık' }, { value: 'in_review', label: 'İncelemede' }, { value: 'done', label: 'Tamamlanan' },
];
const matches = (task: ReportTask, filter: TaskFilter) => filter === 'all' || (filter === 'open' ? task.status === 'todo' || task.status === 'in_progress' : task.status === filter);

/** Task rows of a report; the backend already decided timing and person attribution. */
export function ReportTasks({ title, description, tasks, showPerson = false, showCommittee = true, empty }: {
  title: string; description?: string; tasks: ReportTask[]; showPerson?: boolean; showCommittee?: boolean; empty: string;
}) {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const counts = useMemo(() => Object.fromEntries(taskFilters.map(item => [item.value, tasks.filter(task => matches(task, item.value)).length])) as Record<TaskFilter, number>, [tasks]);
  const order: Record<TaskStatus, number> = { in_review: 0, in_progress: 1, todo: 2, done: 3 };
  const visible = tasks.filter(task => matches(task, filter))
    .sort((a, b) => order[a.status] - order[b.status] || (a.status === 'done' ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '') : (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9')));
  return <Card className="report-card">
    <header className="report-card-head">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      <div className="segmented" role="group" aria-label="Görev durumuna göre filtrele">
        {taskFilters.map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{counts[item.value]}</span></button>)}
      </div>
    </header>
    {!visible.length ? <p className="report-empty">{tasks.length ? 'Bu filtrede görev yok.' : empty}</p>
      : <table className="report-table">
        <thead><tr><th scope="col">Görev</th>{showPerson && <th scope="col">Kişi</th>}<th scope="col">Durum</th><th scope="col">Son tarih</th><th scope="col">Teslim</th><th scope="col">Zamanlama</th></tr></thead>
        <tbody>{visible.map(task => <tr key={task.id}>
          <td><strong>{task.title}</strong>{showCommittee && <small>{task.committeeName}</small>}
            {task.links.length > 0 && <span className="report-links">{task.links.map((link, index) => <a key={`${index}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer nofollow">{link.label || new URL(link.url).host}</a>)}</span>}
            {(task.rejections > 0 || task.reopens > 0) && <small className="history-note">{[task.rejections && `${task.rejections} ret`, task.reopens && `${task.reopens} yeniden açma`].filter(Boolean).join(' · ')}</small>}</td>
          {showPerson && <td data-label="Kişi"><span>{task.personName}</span><EmailLink email={task.personEmail} /></td>}
          <td data-label="Durum"><StatusBadge status={task.status} /></td>
          <td data-label="Son tarih" className="muted">{formatDate(task.dueAt)}</td>
          <td data-label="Teslim" className="muted">{formatDateTime(task.submittedAt)}</td>
          <td data-label="Zamanlama"><TimingBadge timing={task.timing} /></td>
        </tr>)}</tbody>
      </table>}
  </Card>;
}

/** Per committee or per person counts; `link` builds the deeper report address when the viewer may open it. */
export function BreakdownTable<R extends Breakdown>({ title, description, rows, label, link, extra }: {
  title: string; description?: string; rows: R[]; label: string; link?: (row: R) => string | null; extra?: (row: R) => ReactNode;
}) {
  return <Card className="report-card">
    <header className="report-card-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>
    {!rows.length ? <EmptyState icon={<ListTodo size={22} />} title="Henüz kayıt yok" description="Görevler oluşturuldukça bu tablo dolacak." />
      : <table className="report-table is-breakdown">
        <thead><tr><th scope="col">{label}</th><th scope="col">Açık</th><th scope="col">İncelemede</th><th scope="col">Tamamlanan</th><th scope="col">Zamanında</th><th scope="col">Geciken</th></tr></thead>
        <tbody>{rows.map(row => {
          const href = link?.(row);
          return <tr key={row.id}>
            <td>{href ? <a href={href}>{row.name}</a> : <strong>{row.name}</strong>}{row.email && <EmailLink email={row.email} />}{extra?.(row)}</td>
            <td data-label="Açık">{row.summary.open}</td>
            <td data-label="İncelemede">{row.summary.inReview}</td>
            <td data-label="Tamamlanan">{row.summary.completed}</td>
            <td data-label="Zamanında">{row.summary.onTime}</td>
            <td data-label="Geciken" className={row.summary.overdueTotal ? 'is-alert' : undefined}>{row.summary.overdueTotal}</td>
          </tr>;
        })}</tbody>
      </table>}
  </Card>;
}
