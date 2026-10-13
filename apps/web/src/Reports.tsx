import { useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, KeyRound, UsersRound } from 'lucide-react';
import type { Committee, CommitteeReport, OverviewReport, PersonReport, ReportTask } from './api';
import { authClient } from './auth-client';
import type { Me } from './Dashboard';
import { BreakdownTable, formatDate, formatDateTime, LoadError, ReportTasks, StatusBadge, SummaryCards, TimingBadge, useApi } from './reporting';
import { Avatar, Badge, Button, Card, EmptyState, Field } from './ui';

const roleName = (role: string | null) => role === 'lead' ? 'Komite başkanı' : role === 'member' ? 'Üye' : 'Ayrıldı';
const generated = (value?: string) => value ? `Veriler ${formatDateTime(value)} itibarıyla.` : 'Veriler yükleniyor…';

function Skeleton() {
  return <Card className="report-card"><div className="users-skeleton" aria-label="Yükleniyor"><i /><i /><i /></div></Card>;
}

function BackLink({ href, label }: { href: string; label: string }) {
  return <a className="back-link" href={href}><ArrowLeft size={16} />{label}</a>;
}

/** Open own work first by deadline; undated work after dated work. */
function upcoming(tasks: ReportTask[]) {
  return tasks.filter(task => task.status !== 'done')
    .sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
    .slice(0, 6);
}

export function Overview({ me }: { me: Me }) {
  const admin = me.role === 'super_admin';
  const personal = useApi<PersonReport>('/api/reports/me');
  const overall = useApi<OverviewReport>(admin ? '/api/reports/overview' : null);
  const committees = useApi<Committee[]>('/api/committees');
  const summary = admin ? overall.data?.summary ?? null : personal.data?.summary ?? null;
  const tasks = personal.data ? upcoming(personal.data.tasks) : null;
  const active = committees.data?.filter(item => !item.archivedAt) ?? null;
  return <>
    <div className="page-title-row"><div><h1>Genel Bakış</h1><p>Hoş geldin, {me.name}. {admin ? 'Topluluğun güncel çalışma durumunu burada görebilirsin.' : 'Sana atanan işlerin güncel durumunu burada görebilirsin.'}</p></div>
      <Button variant="primary" onClick={() => location.assign('/panolar')}>Panolara git</Button></div>
    {(admin ? overall.error : personal.error) ? <LoadError error={(admin ? overall.error : personal.error)!} retry={admin ? overall.retry : personal.retry} />
      : <SummaryCards summary={summary} />}
    {admin && overall.data && <p className="report-meta">{overall.data.committeeCount} aktif komite · {overall.data.memberCount} aktif üye · Sayaçlar bütün komiteleri kapsar.</p>}
    <div className="overview-grid">
      <Card className="activity-card">
        <header><div><h2>Yaklaşan işler</h2><p>Üzerine atanan açık görevler, son tarihe göre</p></div><a href="/profilim">Tümünü gör</a></header>
        {!tasks ? <div className="users-skeleton"><i /><i /><i /></div>
          : !tasks.length ? <EmptyState icon={<img className="empty-mascot" src="/mascot/empty.png" alt="" />} title="Açık görevin yok" description="Sana atanan yeni işler burada son teslim tarihine göre listelenecek." action={<Button onClick={() => location.assign('/panolar')}>Panoyu aç</Button>} />
          : <ul className="task-list">{tasks.map(task => <li key={task.id}>
            <div><strong>{task.title}</strong><small>{task.committeeName} · Son tarih: {formatDate(task.dueAt)}</small></div>
            <span>{task.timing === 'overdue' && <TimingBadge timing={task.timing} />}<StatusBadge status={task.status} /></span>
          </li>)}</ul>}
      </Card>
      <Card className="committee-card">
        <header><h2>Komiteler</h2><p>{admin ? 'Topluluktaki aktif ekipler' : 'Dahil olduğun ekiplerin kısa durumu'}</p></header>
        {!active ? <div className="users-skeleton"><i /><i /></div>
          : !active.length ? <EmptyState icon={<UsersRound size={23} />} title={admin ? 'Henüz komite yok' : 'Komite bekleniyor'} description={admin ? 'Komiteler ekranından ilk ekibi oluşturabilirsin.' : 'Başkan seni bir komiteye eklediğinde ekip bilgileri burada görünecek.'} />
          : <ul className="committee-list">{active.map(item => <li key={item.id}>
            <a href={`/panolar?komite=${item.id}`}><strong>{item.name}</strong><small>{item.memberCount} üye · {item.openTasks} açık görev</small></a>
            {item.myRole && <Badge tone={item.myRole === 'lead' ? 'blue' : 'gray'}>{roleName(item.myRole)}</Badge>}
          </li>)}</ul>}
      </Card>
    </div>
  </>;
}

function PasswordCard() {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const newPassword = String(data.get('newPassword'));
    if (newPassword !== String(data.get('confirmation'))) { setNotice({ kind: 'error', text: 'Yeni şifreler eşleşmiyor.' }); return; }
    setPending(true); setNotice(null);
    const result = await authClient.changePassword({ currentPassword: String(data.get('currentPassword')), newPassword, revokeOtherSessions: true });
    setPending(false);
    if (result.error) setNotice({ kind: 'error', text: 'Şifre değiştirilemedi. Mevcut şifreni kontrol edip yeniden dene.' });
    else { form.reset(); setNotice({ kind: 'success', text: 'Şifren güncellendi. Diğer cihazlardaki oturumların kapatıldı.' }); }
  }
  return <Card className="password-card">
    <header><h2><KeyRound size={17} />Şifre değiştir</h2><p>Yeni şifre en az 12 karakter olmalı.</p></header>
    <form className="password-form" onSubmit={submit}>
      <Field label="Mevcut şifre" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
      <Field label="Yeni şifre" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <Field label="Yeni şifre tekrarı" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      {notice && <p className={notice.kind === 'error' ? 'form-error' : 'form-success'} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Kaydediliyor…' : 'Şifreyi güncelle'}</Button>
    </form>
  </Card>;
}

function PersonHeader({ report, email, subtitle }: { report: PersonReport; email?: string; subtitle?: string }) {
  return <Card className="person-card">
    <Avatar name={report.person.name} />
    <div><strong>{report.person.name}{!report.person.active && <Badge>Pasif</Badge>}</strong><small>{email ?? subtitle}</small></div>
    <ul className="chip-list" aria-label="Komiteler">
      {report.committees.length ? report.committees.map(item => <li key={item.id}>{item.name}<span>{item.archivedAt ? 'Arşiv' : roleName(item.role)}</span></li>)
        : <li className="is-empty">Komite yok</li>}
    </ul>
  </Card>;
}

export function Profile({ me }: { me: Me }) {
  const { data, error, retry } = useApi<PersonReport>('/api/reports/me');
  return <>
    <div className="page-title-row"><div><h1>Profilim</h1><p>Kendi görevlerin, teslimlerin ve temel sayaçların. {data && generated(data.generatedAt)}</p></div></div>
    {error ? <LoadError error={error} retry={retry} /> : <div className="report-stack">
      {data ? <PersonHeader report={data} email={me.email} /> : <Skeleton />}
      <SummaryCards summary={data?.summary ?? null} />
      {data ? <ReportTasks title="Görevlerim" description="Açık işlerin ve onaylanan teslimlerin" tasks={data.tasks} empty="Henüz sana atanmış bir görev yok." /> : <Skeleton />}
      {data && data.byCommittee.length > 1 && <BreakdownTable title="Komitelere göre" rows={data.byCommittee} label="Komite" />}
      <PasswordCard />
    </div>}
  </>;
}

function PersonReportView({ id, from }: { id: string; from: string | null }) {
  const { data, error, retry } = useApi<PersonReport>(`/api/reports/users/${encodeURIComponent(id)}`);
  const back = from ? `/raporlar?komite=${encodeURIComponent(from)}` : '/raporlar';
  return <>
    <BackLink href={back} label={from ? 'Komite raporuna dön' : 'Raporlara dön'} />
    <div className="page-title-row"><div><h1>{data?.person.name ?? 'Kişi raporu'}</h1><p>Görüntüleme yetkin kapsamındaki görevler. {data && generated(data.generatedAt)}</p></div></div>
    {error ? <LoadError error={error} retry={retry} /> : <div className="report-stack">
      {data ? <PersonHeader report={data} subtitle="Kişi raporu" /> : <Skeleton />}
      <SummaryCards summary={data?.summary ?? null} />
      {data ? <>
        <ReportTasks title="Görevler" tasks={data.tasks} empty="Bu kişiye ait görev yok." />
        {data.byCommittee.length > 1 && <BreakdownTable title="Komitelere göre" rows={data.byCommittee} label="Komite" link={row => `/raporlar?komite=${encodeURIComponent(row.id)}`} />}
      </> : <Skeleton />}
    </div>}
  </>;
}

function CommitteeReportView({ id, admin, picker }: { id: string; admin: boolean; picker?: Committee[] }) {
  const { data, error, retry } = useApi<CommitteeReport>(`/api/reports/committees/${encodeURIComponent(id)}`);
  return <>
    {admin && <BackLink href="/raporlar" label="Genel rapora dön" />}
    <div className="page-title-row">
      <div><h1>{data?.committee.name ?? 'Komite raporu'}{data?.committee.archivedAt && <Badge>Arşiv</Badge>}</h1>
        <p>{data ? `${data.memberCount} aktif üye. ${generated(data.generatedAt)}` : generated()}</p></div>
      {picker && picker.length > 1 && <label className="board-select"><span className="sr-only">Komite seç</span>
        <select className="ui-input" value={id} onChange={event => location.assign(`/raporlar?komite=${encodeURIComponent(event.target.value)}`)}>
          {picker.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
    </div>
    {error ? <LoadError error={error} retry={retry} /> : <div className="report-stack">
      <SummaryCards summary={data?.summary ?? null} />
      {data ? <>
        <BreakdownTable title="Kişilere göre" description="Tamamlanan iş onaylanan teslimin sorumlusuna, açık iş güncel sorumluya yazılır." rows={data.byPerson} label="Kişi"
          link={row => admin || row.role ? `/raporlar?kisi=${encodeURIComponent(row.id)}&komite=${encodeURIComponent(id)}` : null}
          extra={row => <small>{roleName(row.role)}{!row.active && row.role ? ' · Pasif' : ''}</small>} />
        <ReportTasks title="Komite görevleri" tasks={data.tasks} showPerson showCommittee={false} empty="Bu komitede henüz görev yok." />
      </> : <Skeleton />}
    </div>}
  </>;
}

function OverviewReportView() {
  const { data, error, retry } = useApi<OverviewReport>('/api/reports/overview');
  return <>
    <div className="page-title-row"><div><h1>Raporlar</h1><p>Bütün komitelerin özeti; aynı görev bir kez sayılır. {data && generated(data.generatedAt)}</p></div></div>
    {error ? <LoadError error={error} retry={retry} /> : <div className="report-stack">
      <SummaryCards summary={data?.summary ?? null} />
      {data ? <>
        <p className="report-meta">{data.committeeCount} aktif komite · {data.memberCount} aktif üye</p>
        <BreakdownTable title="Komitelere göre" rows={data.byCommittee} label="Komite" link={row => `/raporlar?komite=${encodeURIComponent(row.id)}`}
          extra={row => row.archivedAt ? <small>Arşivlendi</small> : null} />
        <BreakdownTable title="Kişilere göre" rows={data.byPerson} label="Kişi" link={row => `/raporlar?kisi=${encodeURIComponent(row.id)}`} />
      </> : <Skeleton />}
    </div>}
  </>;
}

/** Committee leads only report on committees they lead; the API enforces the same scope. */
function LeadReports({ selected }: { selected: string | null }) {
  const { data, error, retry } = useApi<Committee[]>('/api/committees');
  if (error) return <LoadError error={error} retry={retry} />;
  if (!data) return <><div className="page-title-row"><div><h1>Raporlar</h1></div></div><Skeleton /></>;
  const led = data.filter(item => item.myRole === 'lead' && !item.archivedAt);
  if (!led.length) return <><div className="page-title-row"><div><h1>Raporlar</h1></div></div>
    <Card><EmptyState icon={<BarChart3 size={23} />} title="Yönettiğin komite yok" description="Komite başkanı olduğun bir ekip olduğunda raporu burada görünür." /></Card></>;
  const id = selected && led.some(item => item.id === selected) ? selected : led[0].id;
  return <CommitteeReportView key={id} id={id} admin={false} picker={led} />;
}

export function Reports({ me }: { me: Me }) {
  const params = new URLSearchParams(location.search);
  const person = params.get('kisi'); const committee = params.get('komite');
  const admin = me.role === 'super_admin';
  if (person) return <PersonReportView id={person} from={committee} />;
  if (admin) return committee ? <CommitteeReportView id={committee} admin /> : <OverviewReportView />;
  return <LeadReports selected={committee} />;
}
