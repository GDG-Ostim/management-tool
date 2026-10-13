import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { authClient } from './auth-client';
import { Dashboard, type Me } from './Dashboard';

type Notice = { kind: 'success' | 'error'; text: string } | null;

function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="auth-page">
    <section className="brand-panel" aria-label="GDG OSTİM">
      <div className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></div>
      <div><strong>GDG OSTİM</strong><span>Management Tool</span></div>
      <p>Komiteler, görevler ve ekip çıktıları için ortak çalışma alanı.</p>
      <div className="brand-lines" aria-hidden="true"><i /><i /><i /><i /></div>
    </section>
    <section className="auth-panel"><div className="auth-card"><header><h1>{title}</h1><p>{description}</p></header>{children}</div></section>
  </main>;
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</div>;
}

function Login() {
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState<Notice>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setNotice(null);
    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(data.get('email')), password: String(data.get('password')) });
    setPending(false);
    if (result.error?.status === 429) setNotice({ kind: 'error', text: 'Çok fazla giriş denemesi yapıldı. Biraz bekleyip yeniden deneyin.' });
    else if (result.error) setNotice({ kind: 'error', text: 'E-posta veya şifre hatalı. Hesabınız henüz etkinleştirilmemiş de olabilir.' });
    else window.location.assign('/');
  }
  return <AuthLayout title="Tekrar hoş geldiniz" description="Ekibinizin çalışma alanına giriş yapın.">
    <form onSubmit={submit} className="auth-form">
      <label>E-posta<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ad@ornek.com" /></label>
      <label>Şifre<input name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label>
      <NoticeBox notice={notice} />
      <button className="primary" disabled={pending}>{pending ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      <a className="text-link" href="/sifremi-unuttum">Şifremi unuttum</a>
    </form>
    <p className="help">Hesabınız başkan tarafından oluşturulur. Kayıt bağlantısı bulunmaz.</p>
  </AuthLayout>;
}

function ForgotPassword() {
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState<Notice>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setNotice(null);
    const email = String(new FormData(event.currentTarget).get('email'));
    const response = await fetch('/api/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    setPending(false);
    if (response.ok) setNotice({ kind: 'success', text: 'Hesabınız varsa şifre belirleme bağlantısı e-postanıza gönderilecek.' });
    else setNotice({ kind: 'error', text: 'E-posta adresini kontrol edip yeniden deneyin.' });
  }
  return <AuthLayout title="Şifrenizi yenileyin" description="Hesabınıza bağlı e-posta adresini girin.">
    <form onSubmit={submit} className="auth-form">
      <label>E-posta<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <NoticeBox notice={notice} />
      <button className="primary" disabled={pending}>{pending ? 'Gönderiliyor…' : 'Bağlantı gönder'}</button>
      <a className="text-link" href="/giris">Giriş ekranına dön</a>
    </form>
  </AuthLayout>;
}

function ResetPassword() {
  const token = useMemo(() => new URLSearchParams(location.search).get('token') ?? '', []);
  const error = useMemo(() => new URLSearchParams(location.search).get('error'), []);
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState<Notice>(error ? { kind: 'error', text: 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.' } : null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const password = String(data.get('password')); const confirmation = String(data.get('confirmation'));
    if (password !== confirmation) { setNotice({ kind: 'error', text: 'Şifreler eşleşmiyor.' }); return; }
    setPending(true); setNotice(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (result.error) setNotice({ kind: 'error', text: 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.' });
    else { setNotice({ kind: 'success', text: 'Şifreniz belirlendi. Şimdi giriş yapabilirsiniz.' }); form.reset(); }
  }
  return <AuthLayout title="Şifrenizi belirleyin" description="En az 12 karakterli yeni bir şifre oluşturun.">
    <form onSubmit={submit} className="auth-form">
      <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={!token || !!error} /></label>
      <label>Şifre tekrarı<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={!token || !!error} /></label>
      <NoticeBox notice={notice} />
      <button className="primary" disabled={pending || !token || !!error}>{pending ? 'Kaydediliyor…' : 'Şifreyi kaydet'}</button>
      <a className="text-link" href={notice?.kind === 'success' ? '/giris' : '/sifremi-unuttum'}>{notice?.kind === 'success' ? 'Giriş yap' : 'Yeni bağlantı iste'}</a>
    </form>
  </AuthLayout>;
}

function Home() {
  const { data, isPending } = authClient.useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isPending && !data) { window.location.replace('/giris'); return; }
    if (!data) return;
    const controller = new AbortController();
    fetch('/api/me', { signal: controller.signal }).then(async response => {
      if (response.status === 401) { await authClient.signOut(); location.replace('/giris'); return; }
      if (!response.ok) throw new Error('profile');
      setMe(await response.json() as Me);
    }).catch(error => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [data, isPending]);
  if (failed) return <main className="loading"><strong>Çalışma alanı açılamadı</strong><span>Bağlantını kontrol edip sayfayı yenile.</span><button onClick={() => location.reload()}>Yeniden dene</button></main>;
  if (isPending || !data || !me) return <main className="loading"><span className="loading-spinner" aria-hidden="true" />Çalışma alanı yükleniyor…</main>;
  return <Dashboard me={me} />;
}

export function App() {
  if (location.pathname === '/giris') return <Login />;
  if (location.pathname === '/sifremi-unuttum') return <ForgotPassword />;
  if (location.pathname === '/sifre-belirle') return <ResetPassword />;
  return <Home />;
}
