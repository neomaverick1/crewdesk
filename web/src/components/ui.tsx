import { CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import {
  useEffect,
  useId,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import type { InvoiceStatus, JobStatus, Person, Role } from '../../../server/types.ts';
import { INVOICE_STATUS, initials, JOB_STATUS, ROLE } from '../lib/format.ts';
import { cx } from '../lib/cx.ts';
import { snapshot, subscribe } from '../lib/toast.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-orange-500 text-white shadow-sm hover:bg-orange-600 disabled:bg-orange-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 shadow-sm hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  danger: 'bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:text-rose-300',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        className,
      )}
    >
      {children}
    </span>
  );
}

export const JobBadge = ({ status }: { status: JobStatus }) => (
  <Badge className={JOB_STATUS[status].badge}>
    <span className={cx('size-1.5 rounded-full', JOB_STATUS[status].dot)} />
    {JOB_STATUS[status].label}
  </Badge>
);
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => (
  <Badge className={INVOICE_STATUS[status].badge}>{INVOICE_STATUS[status].label}</Badge>
);
export const RoleBadge = ({ role }: { role: Role }) => <Badge className={ROLE[role].badge}>{ROLE[role].label}</Badge>;

export function Avatar({ person, size = 'md' }: { person: Pick<Person, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'size-6 text-[10px]' : size === 'lg' ? 'size-10 text-sm' : 'size-8 text-xs';
  return (
    <span
      title={person.name}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', dims)}
      style={{ background: person.color }}
    >
      {initials(person.name)}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className,
  pad = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={cx('rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

const control =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-500';

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id)}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const Input = ({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) => (
  <input {...rest} className={cx(control, invalid ? 'ring-rose-300' : 'ring-slate-300', className)} />
);
export const Select = ({ invalid, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) => (
  <select {...rest} className={cx(control, 'pr-8', invalid ? 'ring-rose-300' : 'ring-slate-300', className)} />
);
export const Textarea = ({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) => (
  <textarea {...rest} className={cx(control, invalid ? 'ring-rose-300' : 'ring-slate-300', className)} />
);

function useEscape(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside role="dialog" aria-modal="true" className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{title}</div>
            {subtitle ? <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="size-5 animate-spin text-orange-500" />
      {label}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">{icon}</div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, snapshot);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {t.tone === 'success' ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : t.tone === 'error' ? (
            <XCircle className="size-4 text-rose-400" />
          ) : (
            <Info className="size-4 text-sky-400" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
