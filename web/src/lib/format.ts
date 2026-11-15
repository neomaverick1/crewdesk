import type { InvoiceStatus, JobStatus, Priority, Role } from '../../../server/types.ts';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const money = (cents: number) => usd.format(cents / 100);
export const moneyShort = (cents: number) => (Math.abs(cents) >= 100_000 ? usd0.format(cents / 100) : usd.format(cents / 100));
export const moneyCompact = (cents: number) => {
  const d = cents / 100;
  return d >= 1000 ? `$${(d / 1000).toFixed(d >= 10_000 ? 0 : 1)}k` : `$${Math.round(d)}`;
};

// Dates and times are always shown in the company's time zone, wherever the viewer is.
const fmt = (tz: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });

export const time = (iso: string, tz: string) => fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const day = (iso: string, tz: string) => fmt(tz, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
export const dayShort = (iso: string, tz: string) => fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
export const dateTime = (iso: string, tz: string) =>
  fmt(tz, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const longDate = (d: Date, tz: string) => fmt(tz, { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
export const hourOf = (d: Date, tz: string) => Number(fmt(tz, { hour: 'numeric', hourCycle: 'h23' }).format(d));
/** "2026-11-17" in the company's time zone, to group things by day. */
export const dayKey = (iso: string | Date, tz: string) =>
  fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
    .replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2');

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const JOB_STATUS: Record<JobStatus, { label: string; dot: string; badge: string }> = {
  new: { label: 'New', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 ring-slate-200' },
  scheduled: { label: 'Scheduled', dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  done: { label: 'Done', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cancelled: { label: 'Cancelled', dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; badge: string }> = {
  draft: { label: 'Draft', badge: 'bg-slate-100 text-slate-700 ring-slate-200' },
  sent: { label: 'Sent', badge: 'bg-sky-50 text-sky-700 ring-sky-200' },
  overdue: { label: 'Overdue', badge: 'bg-rose-50 text-rose-700 ring-rose-200' },
  paid: { label: 'Paid', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  void: { label: 'Void', badge: 'bg-slate-100 text-slate-500 ring-slate-200 line-through' },
};

export const PRIORITY: Record<Priority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-slate-500' },
  normal: { label: 'Normal', className: 'text-slate-600' },
  urgent: { label: 'Urgent', className: 'text-rose-600 font-semibold' },
};

export const ROLE: Record<Role, { label: string; badge: string; about: string }> = {
  owner: { label: 'Owner', badge: 'bg-violet-50 text-violet-700 ring-violet-200', about: 'Everything, including money and the team' },
  dispatcher: { label: 'Dispatcher', badge: 'bg-sky-50 text-sky-700 ring-sky-200', about: 'Jobs, schedule, customers and invoices' },
  technician: { label: 'Technician', badge: 'bg-orange-50 text-orange-700 ring-orange-200', about: 'Their own jobs and day' },
};
