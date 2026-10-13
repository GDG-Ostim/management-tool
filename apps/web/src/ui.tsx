import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'icon';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'default', type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={classes('ui-button', `is-${variant}`, `is-${size}`, className)} {...props} />;
});

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={classes('ui-card', className)} {...props} />;
}

export function Avatar({ name, size = 'default' }: { name: string; size?: 'default' | 'small' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('tr-TR')).join('');
  return <span className={classes('ui-avatar', size === 'small' && 'is-small')} aria-hidden="true">{initials || '?'}</span>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state">
    <span className="empty-state-icon" aria-hidden="true">{icon}</span>
    <strong>{title}</strong>
    <p>{description}</p>
    {action}
  </div>;
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'blue' | 'green' | 'yellow' | 'red'; children: ReactNode }) {
  return <span className={`ui-badge tone-${tone}`}>{children}</span>;
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <label className="ui-field"><span>{label}</span><input className="ui-input" {...props} />{hint && <small>{hint}</small>}</label>;
}

export function Dialog({ open, title, description, onClose, busy = false, children }: { open: boolean; title: string; description?: string; onClose(): void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="ui-dialog" aria-labelledby="ui-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    {open && <>
      <header><div><h2 id="ui-dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
        <Button size="icon" variant="ghost" aria-label="Kapat" onClick={onClose} disabled={busy}><X size={19} /></Button></header>
      {children}
    </>}
  </dialog>;
}

export type ToastMessage = { tone: 'success' | 'error'; text: string; image?: string } | null;

export function Toast({ toast, close }: { toast: ToastMessage; close(): void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(close, 5000);
    return () => clearTimeout(timer);
  }, [toast, close]);
  if (!toast) return null;
  return <div className={`toast is-${toast.tone}${toast.image ? ' has-image' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
    {toast.image && <img src={toast.image} alt="" />}<span>{toast.text}</span><button aria-label="Bildirimi kapat" onClick={close}>×</button>
  </div>;
}
