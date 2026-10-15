import { EmailLink } from './EmailLink';
import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { api, errorMessage, type TaskDetails as Details } from './api';
import { formatDateTime } from './reporting';
import { ReviewTimeline } from './ReviewTimeline';
import { Avatar, Button } from './ui';

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** Labels, checklist, output links, comments and review history beside the task form. */
export function TaskDetails({ taskId, version }: { taskId: string; version: number }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const base = `/api/tasks/${encodeURIComponent(taskId)}`;

  useEffect(() => {
    let live = true;
    api<Details>(`${base}/details`).then(value => { if (live) setDetails(value); }, reason => { if (live) setError(errorMessage(reason, 'Görev ayrıntıları yüklenemedi.')); });
    return () => { live = false; };
  }, [base, version]);

  /** Runs one change; the server answers with the whole detail state. Returns false on failure so forms keep their input. */
  async function change(path: string, method: string, body?: unknown) {
    setBusy(true); setError(null);
    try { setDetails(await api<Details>(`${base}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })); return true; }
    catch (reason) { setError(errorMessage(reason, 'Değişiklik kaydedilemedi.')); return false; }
    finally { setBusy(false); }
  }
  const submitWith = (handler: (data: FormData) => Promise<boolean>) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget;
    if (await handler(new FormData(form))) form.reset();
  };

  if (!details) return <aside className="task-details" aria-busy={!error}>{error ? <p className="form-error" role="alert">{error}</p> : <div className="users-skeleton"><i /><i /><i /></div>}</aside>;
  const { permissions } = details;
  const done = details.checklist.filter(item => item.checked).length;

  return <aside className="task-details" aria-label="Görev ayrıntıları">
    {error && <p className="form-error" role="alert">{error}</p>}

    <section aria-labelledby="detail-labels">
      <h3 id="detail-labels">Etiketler</h3>
      {details.labels.length ? <ul className="label-list">{details.labels.map(name => <li key={name}><Tag size={12} />{name}
        {permissions.labels && <button type="button" aria-label={`${name} etiketini kaldır`} disabled={busy} onClick={() => change('/labels', 'PUT', { names: details.labels.filter(item => item !== name) })}><X size={12} /></button>}</li>)}</ul>
        : <p className="detail-empty">Etiket yok.</p>}
      {permissions.labels && <form className="inline-form" onSubmit={submitWith(data => change('/labels', 'PUT', { names: [...details.labels, String(data.get('label')).trim()] }))}>
        <input className="ui-input" name="label" list={`labels-${taskId}`} maxLength={30} required placeholder="Etiket ekle" aria-label="Yeni etiket" />
        <datalist id={`labels-${taskId}`}>{details.committeeLabels.filter(name => !details.labels.includes(name)).map(name => <option key={name} value={name} />)}</datalist>
        <Button type="submit" size="icon" aria-label="Etiketi ekle" disabled={busy}><Plus size={16} /></Button>
      </form>}
    </section>

    <section aria-labelledby="detail-checklist">
      <h3 id="detail-checklist">Kontrol listesi{details.checklist.length > 0 && <span>{done}/{details.checklist.length}</span>}</h3>
      {details.checklist.length > 0 && <progress className="checklist-progress" max={details.checklist.length} value={done} aria-label="Tamamlanan maddeler" />}
      {details.checklist.length ? <ul className="checklist">{details.checklist.map(item => <li key={item.id}>
        <label><input type="checkbox" checked={item.checked} disabled={!permissions.edit || busy} onChange={event => change(`/checklist/${item.id}`, 'PATCH', { checked: event.target.checked })} /><span>{item.text}</span></label>
        {permissions.edit && <button type="button" className="detail-remove" aria-label={`${item.text} maddesini sil`} disabled={busy} onClick={() => change(`/checklist/${item.id}`, 'DELETE')}><Trash2 size={14} /></button>}
      </li>)}</ul> : <p className="detail-empty">Henüz madde yok.</p>}
      {permissions.edit && <form className="inline-form" onSubmit={submitWith(data => change('/checklist', 'POST', { text: String(data.get('text')).trim() }))}>
        <input className="ui-input" name="text" maxLength={300} required placeholder="Madde ekle" aria-label="Yeni kontrol listesi maddesi" />
        <Button type="submit" size="icon" aria-label="Maddeyi ekle" disabled={busy}><Plus size={16} /></Button>
      </form>}
    </section>

    <section aria-labelledby="detail-links">
      <h3 id="detail-links">Çıktı bağlantıları</h3>
      {details.links.length ? <ul className="link-list">{details.links.map(link => <li key={link.id}>
        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink size={14} /><span><strong>{link.label || host(link.url)}</strong>{link.label && <small>{host(link.url)}</small>}</span></a>
        {permissions.edit && <button type="button" className="detail-remove" aria-label={`${link.label || host(link.url)} bağlantısını sil`} disabled={busy} onClick={() => change(`/links/${link.id}`, 'DELETE')}><Trash2 size={14} /></button>}
      </li>)}</ul> : <p className="detail-empty">Henüz çıktı eklenmedi. Dosyayı Drive gibi bir yere yükleyip bağlantısını ekleyebilirsin.</p>}
      {permissions.edit && <form className="link-form" onSubmit={submitWith(data => change('/links', 'POST', { url: String(data.get('url')).trim(), label: String(data.get('label')).trim() }))}>
        <input className="ui-input" name="url" type="url" maxLength={2000} required placeholder="https://…" aria-label="Bağlantı adresi" />
        <input className="ui-input" name="label" maxLength={120} placeholder="Ad (isteğe bağlı)" aria-label="Bağlantı adı" />
        <Button type="submit" disabled={busy}><Plus size={16} />Ekle</Button>
      </form>}
    </section>

    <section aria-labelledby="detail-comments">
      <h3 id="detail-comments">Yorumlar{details.comments.length > 0 && <span>{details.comments.length}</span>}</h3>
      {details.comments.length ? <ol className="comment-list">{details.comments.map(comment => <li key={comment.id}>
        <Avatar name={comment.authorName} size="small" />
        <div>
          <header><strong>{comment.authorName}</strong><EmailLink email={comment.authorEmail} /><time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}{comment.updatedAt !== comment.createdAt && ' · düzenlendi'}</time></header>
          {editing === comment.id
            ? <form className="comment-edit" onSubmit={submitWith(async data => { const ok = await change(`/comments/${comment.id}`, 'PATCH', { body: String(data.get('body')).trim() }); if (ok) setEditing(null); return ok; })}>
              <textarea className="ui-input" name="body" rows={3} maxLength={5000} required defaultValue={comment.body} aria-label="Yorumu düzenle" autoFocus />
              <span><Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Vazgeç</Button><Button type="submit" variant="primary" disabled={busy}>Kaydet</Button></span>
            </form>
            : <p>{comment.body}</p>}
          {comment.mine && editing !== comment.id && <span className="comment-actions">
            <button type="button" onClick={() => setEditing(comment.id)} disabled={busy}><Pencil size={12} />Düzenle</button>
            <button type="button" onClick={() => { if (confirm('Yorum silinsin mi?')) void change(`/comments/${comment.id}`, 'DELETE'); }} disabled={busy}><Trash2 size={12} />Sil</button>
          </span>}
        </div>
      </li>)}</ol> : <p className="detail-empty">Henüz yorum yok.</p>}
      {permissions.comment && <form className="comment-form" onSubmit={submitWith(data => change('/comments', 'POST', { body: String(data.get('body')).trim() }))}>
        <textarea className="ui-input" name="body" rows={2} maxLength={5000} required placeholder="Yorum yaz" aria-label="Yeni yorum" />
        <Button type="submit" variant="primary" disabled={busy}>Gönder</Button>
      </form>}
    </section>

    <ReviewTimeline taskId={taskId} version={version} />
  </aside>;
}
