import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
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
