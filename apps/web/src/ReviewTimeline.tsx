import { EmailLink } from './EmailLink';
import type { ReviewHistory } from './api';
import { formatDate, formatDateTime, useApi } from './reporting';

type Event = { id: string; at: string; tone: 'gray' | 'blue' | 'green' | 'red' | 'yellow'; title: string; email?: string | null; detail?: string; reason?: string | null };

/** Flattens submissions and reopens into one newest-first list; each submission may add its resolution. */
function events(history: ReviewHistory): Event[] {
  const list: Event[] = [];
  for (const item of history.submissions) {
    const timing = item.onTime === null ? 'son tarih yok' : `son tarih ${formatDate(item.dueAt)} · ${item.onTime ? 'zamanında' : 'geç'}`;
    list.push({ id: `${item.id}-submit`, at: item.submittedAt, tone: item.resolution === 'pending' ? 'yellow' : 'blue',
      title: item.resolution === 'pending' ? `${item.submittedBy} teslim etti · onay bekliyor` : `${item.submittedBy} teslim etti`, detail: timing, email: item.submittedByEmail });
    if (item.resolution === 'pending' || !item.resolvedAt) continue;
    const by = item.resolvedBy ?? 'Bilinmeyen kişi';
    if (item.resolution === 'approved') list.push({ id: `${item.id}-done`, at: item.resolvedAt, tone: 'green', title: `${by} onayladı`, email: item.resolvedByEmail });
    if (item.resolution === 'rejected') list.push({ id: `${item.id}-reject`, at: item.resolvedAt, tone: 'red', title: `${by} düzeltme istedi`, email: item.resolvedByEmail, reason: item.reason });
    if (item.resolution === 'withdrawn') list.push({ id: `${item.id}-withdraw`, at: item.resolvedAt, tone: 'gray', title: `${by} teslimi geri çekti`, email: item.resolvedByEmail });
  }
  for (const item of history.reopens) list.push({ id: item.id, at: item.createdAt, tone: 'red', title: `${item.actorName} yeniden açtı`, email: item.actorEmail, reason: item.reason });
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

/** Short review history shown in the task window; the version key refetches after each move. */
export function ReviewTimeline({ taskId, version }: { taskId: string; version: number }) {
  const { data, error, retry } = useApi<ReviewHistory>(`/api/tasks/${encodeURIComponent(taskId)}/reviews?v=${version}`);
  const list = data ? events(data) : [];
  return <section className="review-timeline" aria-label="İnceleme geçmişi">
    <h3>İnceleme geçmişi</h3>
    {error ? <p className="review-empty">Geçmiş yüklenemedi. <button type="button" onClick={retry}>Yeniden dene</button></p>
      : !data ? <p className="review-empty">Yükleniyor…</p>
      : !list.length ? <p className="review-empty">Henüz teslim yok. Görev incelemeye gönderildiğinde kayıtlar burada görünür.</p>
      : <ol>{list.map(item => <li key={item.id} className={`tone-${item.tone}`}>
        <span><strong>{item.title}</strong><time dateTime={item.at}>{formatDateTime(item.at)}</time></span>
        {item.email && <EmailLink email={item.email} />}
        {item.detail && <small>{item.detail}</small>}
        {item.reason && <q>{item.reason}</q>}
      </li>)}</ol>}
  </section>;
}
