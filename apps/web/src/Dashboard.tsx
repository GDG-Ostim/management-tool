import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, ChevronDown, CircleUserRound, FolderKanban,
  LayoutDashboard, LockKeyhole, LogOut, Menu, Settings2, Sparkles, UsersRound, X,
} from 'lucide-react';
import { authClient } from './auth-client';
import { Avatar, Button, Card, EmptyState } from './ui';
import { Overview, Profile, Reports } from './Reports';
import { Users } from './Users';
import { Board } from './Board';
import { Committees } from './Committees';

type Me = { id: string; name: string; email: string; role: 'super_admin' | 'user'; onboardingCompletedAt: string | null; leadsCommittee: boolean };
type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
/** `reports` items are for the president and committee leads; `admin` items only for the president. */
type NavItem = { href: string; label: string; icon: Icon; access?: 'reports' | 'admin' };

const navigation: NavItem[] = [
  { href: '/', label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/panolar', label: 'Panolar', icon: FolderKanban },
  { href: '/profilim', label: 'Profilim', icon: CircleUserRound },
  { href: '/raporlar', label: 'Raporlar', icon: BarChart3, access: 'reports' },
  { href: '/komiteler', label: 'Komiteler', icon: Settings2, access: 'admin' },
  { href: '/kullanicilar', label: 'Kullanıcılar', icon: UsersRound, access: 'admin' },
];

const pageNames: Record<string, string> = {
  '/': 'Genel Bakış', '/panolar': 'Panolar', '/profilim': 'Profilim', '/raporlar': 'Raporlar',
  '/komiteler': 'Komiteler', '/kullanicilar': 'Kullanıcılar',
};

const canReport = (me: Me) => me.role === 'super_admin' || me.leadsCommittee;
const canSee = (item: NavItem, me: Me) => !item.access || me.role === 'super_admin' || (item.access === 'reports' && me.leadsCommittee);

function Brand() {
  return <a className="workspace-brand" href="/" aria-label="GDG OSTİM ana sayfa">
    <span className="brand-dots" aria-hidden="true"><i /><i /><i /><i /></span>
    <span><strong>GDG OSTİM</strong><small>Management Tool</small></span>
  </a>;
}

function Sidebar({ me, mobileOpen, closeMobile, openOnboarding }: { me: Me; mobileOpen: boolean; closeMobile(): void; openOnboarding(): void }) {
  const items = navigation.filter(item => canSee(item, me));
  const workspace = items.filter(item => item.access !== 'admin'); const admin = items.filter(item => item.access === 'admin');
  const currentPath = location.pathname;
  return <>
    <button className={mobileOpen ? 'sidebar-scrim is-open' : 'sidebar-scrim'} aria-label="Menüyü kapat" onClick={closeMobile} />
    <aside className={mobileOpen ? 'workspace-sidebar is-open' : 'workspace-sidebar'} aria-label="Ana menü">
      <div className="sidebar-heading"><Brand /><Button className="mobile-close" size="icon" variant="ghost" aria-label="Menüyü kapat" onClick={closeMobile}><X size={20} /></Button></div>
      <nav className="sidebar-nav">
        <p>Çalışma Alanı</p>
        {workspace.map(({ href, label, icon: NavIcon }) => <a key={href} href={href} className={currentPath === href ? 'is-active' : undefined} aria-current={currentPath === href ? 'page' : undefined}>
          <NavIcon size={19} strokeWidth={1.9} /><span>{label}</span>
        </a>)}
        {admin.length > 0 && <><p>Yönetim</p>{admin.map(({ href, label, icon: NavIcon }) => <a key={href} href={href} className={currentPath === href ? 'is-active' : undefined} aria-current={currentPath === href ? 'page' : undefined}>
          <NavIcon size={19} strokeWidth={1.9} /><span>{label}</span>
        </a>)}</>}
      </nav>
      <div className="sidebar-help">
        <img src="/mascot/calm.png" alt="" />
        <strong>Yardıma mı ihtiyacın var?</strong>
        <button onClick={() => { closeMobile(); openOnboarding(); }}>Kısa tanıtımı aç</button>
      </div>
      <div className="sidebar-footer">
        <details className="account-menu">
          <summary><Avatar name={me.name} /><span><strong>{me.name}</strong><small>{me.role === 'super_admin' ? 'Başkan' : me.leadsCommittee ? 'Komite başkanı' : 'Üye'}</small></span><ChevronDown size={16} /></summary>
          <div className="account-popover">
            <span>{me.email}</span>
            <button onClick={async () => { await authClient.signOut(); location.assign('/giris'); }}><LogOut size={17} />Çıkış yap</button>
          </div>
        </details>
      </div>
    </aside>
  </>;
}

const onboardingSteps = [
  { image: '/mascot/welcome.png', title: 'Çalışma alanına hoş geldin', description: 'Komiteler, görevler ve ekip çıktıları tek bir sade alanda buluşur.' },
  { image: '/mascot/calm.png', title: 'Panonu seç', description: 'Dahil olduğun komitenin panosunu aç; bütün işleri ve sorumluları birlikte gör.' },
  { image: '/mascot/empty.png', title: 'Görevini ilerlet', description: 'Kendi görevini güncelle, çıktını ekle ve hazır olduğunda incelemeye gönder.' },
  { image: '/mascot/celebrate.png', title: 'Çıktılarını görünür kıl', description: 'Tamamlanan işler profil ve raporlarda birikir; ekip emeği somut şekilde görünür olur.' },
];

function OnboardingDialog({ open, admin, pending, error, finish, close }: { open: boolean; admin: boolean; pending: boolean; error: string | null; finish(): void; close(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) { setStep(0); dialog.showModal(); }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const item = onboardingSteps[step];
  const isLast = step === onboardingSteps.length - 1;
  return <dialog ref={dialogRef} className="onboarding-dialog" aria-labelledby="onboarding-title" onCancel={event => { event.preventDefault(); if (!pending) close(); }}>
    <button className="dialog-close" aria-label="Tanıtımı kapat" onClick={close} disabled={pending}><X size={20} /></button>
    <div className="onboarding-visual"><img key={item.image} src={item.image} alt="" /></div>
    <div className="onboarding-copy">
      <span className="step-count">{step + 1} / {onboardingSteps.length}</span>
      <h2 id="onboarding-title">{item.title}</h2>
      <p>{item.description}</p>
      {admin && step === 0 && <p className="admin-note"><Sparkles size={16} />Başkan olarak Kullanıcılar ve Komiteler alanlarını da yönetebilirsin.</p>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="step-dots" aria-hidden="true">
        {onboardingSteps.map((_, index) => <i key={index} className={index === step ? 'is-active' : undefined} />)}
      </div>
      <div className="onboarding-actions">
        <Button variant="ghost" onClick={close} disabled={pending}>{step === 0 ? 'Atla' : 'Kapat'}</Button>
        <span>
          {step > 0 && <Button size="icon" aria-label="Önceki adım" onClick={() => setStep(value => value - 1)} disabled={pending}><ArrowLeft size={18} /></Button>}
          <Button variant="primary" autoFocus onClick={() => isLast ? finish() : setStep(value => value + 1)} disabled={pending}>
            {pending ? 'Kaydediliyor…' : isLast ? 'Çalışma alanına geç' : <>Devam et<ArrowRight size={17} /></>}
          </Button>
        </span>
      </div>
    </div>
  </dialog>;
}

function Forbidden({ title, description = 'Bu sayfa yalnız başkan rolündeki hesaplar için açıktır.' }: { title: string; description?: string }) {
  return <><div className="page-title-row"><div><h1>{title}</h1></div></div>
    <Card><EmptyState icon={<LockKeyhole size={23} />} title="Bu alana erişimin yok" description={description} action={<Button onClick={() => location.assign('/')}>Genel Bakış’a dön</Button>} /></Card></>;
}

function Page({ me, title }: { me: Me; title: string }) {
  if (location.pathname === '/') return <Overview me={me} />;
  if (location.pathname === '/panolar') return <Board me={me} />;
  if (location.pathname === '/profilim') return <Profile me={me} />;
  if (location.pathname === '/raporlar') return canReport(me) ? <Reports me={me} /> : <Forbidden title={title} description="Raporlar başkan ve komite başkanları içindir. Kendi sayaçların Profilim sayfasında." />;
  if (location.pathname === '/kullanicilar') return me.role === 'super_admin' ? <Users me={me} /> : <Forbidden title={title} />;
  if (location.pathname === '/komiteler') return me.role === 'super_admin' ? <Committees /> : <Forbidden title={title} />;
  return <Placeholder title={title} />;
}

function Placeholder({ title }: { title: string }) {
  return <><div className="page-title-row"><div><h1>{title}</h1><p>Bu alanın temel yerleşimi hazır. İçerik ilgili geliştirme işiyle bağlanacak.</p></div></div>
    <Card><EmptyState icon={<FolderKanban size={24} />} title={`${title} yakında hazır`} description="Menü ve responsive çalışma alanı kullanılabilir; bu ekranın iş akışı sonraki issue’da tamamlanacak." /></Card></>;
}

export function Dashboard({ me }: { me: Me }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(!me.onboardingCompletedAt);
  const [onboardingCompleted, setOnboardingCompleted] = useState(!!me.onboardingCompletedAt);
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', close);
    document.body.classList.add('has-open-menu');
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('has-open-menu'); };
  }, [mobileOpen]);
  async function closeOnboarding() {
    if (onboardingCompleted) { setOnboardingOpen(false); return; }
    await completeOnboarding();
  }
  async function completeOnboarding() {
    setOnboardingPending(true); setOnboardingError(null);
    try {
      const response = await fetch('/api/me/onboarding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true }) });
      if (!response.ok) throw new Error('save');
      setOnboardingCompleted(true); setOnboardingOpen(false);
    } catch {
      setOnboardingError('Tanıtım durumu kaydedilemedi. Bağlantını kontrol edip yeniden dene.');
    } finally { setOnboardingPending(false); }
  }
  const title = pageNames[location.pathname] ?? 'Sayfa bulunamadı';
  return <div className="workspace">
    <Sidebar me={me} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} openOnboarding={() => { setOnboardingError(null); setOnboardingOpen(true); }} />
    <div className="workspace-main">
      <header className="mobile-bar"><Button size="icon" variant="ghost" aria-label="Menüyü aç" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={21} /></Button><Brand /><Avatar name={me.name} size="small" /></header>
      <main className="workspace-content"><Page me={me} title={title} /></main>
    </div>
    <OnboardingDialog open={onboardingOpen} admin={me.role === 'super_admin'} pending={onboardingPending} error={onboardingError} finish={completeOnboarding} close={closeOnboarding} />
  </div>;
}

export type { Me };
