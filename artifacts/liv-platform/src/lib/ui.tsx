import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Inbox, X } from 'lucide-react';

export type J = any;

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function useSeo(title: string, description?: string) {
  useEffect(() => {
    document.title = `${title} | LIV LLC Accreditation`;
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'description');
      document.head.appendChild(m);
    }
    m.setAttribute('content', description || 'LIV LLC is a US-based accreditation authority for training providers and a privacy-conscious certificate verification service.');
  }, [title, description]);
}

export const fmtDate = (v: unknown) => {
  if (!v) return '—';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
export const fmtDateTime = (v: unknown) => {
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};
export const logoSrc = (p?: string | null) => (!p ? '' : /^https?:|^data:/.test(p) ? p : `/api/storage${p.startsWith('/') ? '' : '/'}${p}`);
export const errMsg = (e: any, fb = 'Something went wrong. Please try again.') => e?.data?.error || e?.data?.message || e?.message || fb;

const btnBase = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring whitespace-nowrap';
const variants: Record<string, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-card text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  light: 'bg-card text-primary hover:bg-card/90',
};
export function Btn({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: 'sm' | 'md' | 'lg' }) {
  return <button {...p} className={cx(btnBase, variants[variant], size === 'sm' ? 'h-8 px-3' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4', className)} />;
}
export const linkBtn = (variant: keyof typeof variants = 'primary', size: 'sm' | 'md' | 'lg' = 'md') =>
  cx(btnBase, variants[variant], size === 'sm' ? 'h-8 px-3' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4');

const fieldCls = 'w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-ring focus-visible:border-ring';
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-invalid" role="alert">{error}</span>}
    </label>
  );
}
export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(fieldCls, 'h-10', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(fieldCls, 'h-10', p.className)} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(fieldCls, 'py-2 min-h-28', p.className)} />;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border border-card-border bg-card', className)}>{children}</div>;
}
export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">{title}</h1>
        {sub && <p className="mt-1 text-muted-foreground max-w-2xl">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  const s = (status || '').toUpperCase();
  const map: Record<string, [string, string]> = {
    VALID: ['text-valid bg-valid/10 border-valid/30', 'Valid'],
    ACTIVE: ['text-valid bg-valid/10 border-valid/30', 'Active'],
    EXPIRED: ['text-expired bg-expired/10 border-expired/30', 'Expired'],
    PENDING: ['text-expired bg-expired/10 border-expired/30', 'Pending'],
    REVOKED: ['text-invalid bg-invalid/10 border-invalid/30', 'Revoked'],
    INVALID: ['text-invalid bg-invalid/10 border-invalid/30', 'Invalid'],
    SUSPENDED: ['text-invalid bg-invalid/10 border-invalid/30', 'Suspended'],
  };
  const [c, l] = map[s] || ['text-muted-foreground bg-muted border-border', status || 'Unknown'];
  return <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide', c, className)}>{l}</span>;
}

export const Skel = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-md bg-muted', className)} />;
export function SkelRows({ n = 5 }: { n?: number }) {
  return <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">{Array.from({ length: n }).map((_, i) => <Skel key={i} className="h-10" />)}</div>;
}
export function ErrorBox({ error, retry, loginLink }: { error?: any; retry?: () => void; loginLink?: boolean }) {
  const auth = error?.status === 401 || error?.status === 403;
  return (
    <div className="rounded-lg border border-invalid/30 bg-invalid/5 p-6 flex gap-3 items-start" role="alert">
      <AlertTriangle className="size-5 text-invalid mt-0.5 shrink-0" />
      <div className="space-y-2">
        <p className="font-medium text-invalid">{auth ? 'You are not signed in or lack access to this data.' : errMsg(error, 'Could not load this data.')}</p>
        <div className="flex gap-2">
          {retry && <Btn size="sm" variant="outline" onClick={retry}>Try again</Btn>}
          {(auth || loginLink) && <a href={`${import.meta.env.BASE_URL}login`} className={linkBtn('primary', 'sm')}>Sign in</a>}
        </div>
      </div>
    </div>
  );
}
export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="size-12 rounded-full bg-muted grid place-items-center mb-4"><Inbox className="size-5 text-muted-foreground" /></div>
      <p className="font-display text-lg text-primary">{title}</p>
      {text && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-primary/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('w-full max-h-[90dvh] overflow-auto rounded-lg bg-card border border-card-border p-6 liv-rise', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-display text-xl font-semibold text-primary">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ page, total, size = 10, onPage }: { page: number; total: number; size?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
      <span>{total} total, page {page} of {pages}</span>
      <div className="flex gap-2">
        <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Btn>
        <Btn size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Btn>
      </div>
    </div>
  );
}

export const Th = ({ children }: { children?: ReactNode }) => <th className="text-left font-medium text-xs uppercase tracking-wider text-muted-foreground px-4 py-3 whitespace-nowrap">{children}</th>;
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>;

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cx('size-8 rounded-md grid place-items-center font-display font-bold text-sm', light ? 'bg-card text-primary' : 'bg-primary text-primary-foreground')}>LIV</span>
      <span className="leading-tight">
        <span className={cx('block font-display font-semibold', light ? 'text-white' : 'text-primary')}>LIV LLC</span>
        <span className={cx('block text-[10px] uppercase tracking-[0.14em]', light ? 'text-white/60' : 'text-muted-foreground')}>Training Accreditation</span>
      </span>
    </span>
  );
}
