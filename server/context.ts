import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import type { ZodType } from 'zod';

import type { Env } from './auth.ts';
import type { Db } from './db.ts';
import { fromZod, notFound } from './errors.ts';
import type { Activity, InvoiceStatus, JobSummary, Org, Person } from './types.ts';

/** What every route module gets: the database, the clock and the company settings. */
export interface Ctx {
  db: Db;
  now: () => Date;
  org: Org;
}

export const body = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw fromZod(result.error);
  });

export const query = <T extends ZodType>(schema: T) =>
  zValidator('query', schema, (result) => {
    if (!result.success) throw fromZod(result.error);
  });

export function idParam(c: Context<Env>, what: string): number {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) throw notFound(what);
  return id;
}

/** A sent invoice past its due date shows as overdue. */
export const invoiceStatus = (status: string, dueAt: Date | string | null, now: Date): InvoiceStatus =>
  status === 'sent' && dueAt && new Date(dueAt) < now ? 'overdue' : (status as InvoiceStatus);

export const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());

// ---------- jobs ----------

export const JOB_SELECT = `
  select j.id, j.number, j.title, j.status, j.priority, j.scheduled_at, j.duration_minutes, j.estimate_cents,
         c.id as customer_id, c.name as customer_name, c.address as customer_address, c.city as customer_city,
         u.id as tech_id, u.name as tech_name, u.color as tech_color,
         i.id as invoice_id, i.number as invoice_number, i.status as invoice_status, i.due_at as invoice_due_at
  from jobs j
  join customers c on c.id = j.customer_id
  left join users u on u.id = j.technician_id
  left join invoices i on i.job_id = j.id and i.status <> 'void'`;

export interface JobRow {
  id: number;
  number: string;
  title: string;
  status: JobSummary['status'];
  priority: JobSummary['priority'];
  scheduled_at: Date | null;
  duration_minutes: number;
  estimate_cents: number;
  customer_id: number;
  customer_name: string;
  customer_address: string;
  customer_city: string;
  tech_id: number | null;
  tech_name: string | null;
  tech_color: string | null;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_due_at: Date | null;
}

export function toJob(r: JobRow, now: Date): JobSummary {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    priority: r.priority,
    scheduledAt: iso(r.scheduled_at),
    durationMinutes: r.duration_minutes,
    estimateCents: r.estimate_cents,
    customer: { id: r.customer_id, name: r.customer_name, address: r.customer_address, city: r.customer_city },
    technician: r.tech_id === null ? null : { id: r.tech_id, name: r.tech_name!, color: r.tech_color! },
    invoice:
      r.invoice_id === null
        ? null
        : { id: r.invoice_id, number: r.invoice_number!, status: invoiceStatus(r.invoice_status!, r.invoice_due_at, now) },
  };
}

// ---------- activity ----------

export const ACTIVITY_SELECT = `
  select a.id, a.subject, a.message, a.created_at, a.job_id, u.id as user_id, u.name as user_name, u.color as user_color
  from activity a left join users u on u.id = a.user_id`;

export interface ActivityRow {
  id: number;
  subject: string;
  message: string;
  created_at: Date;
  job_id: number | null;
  user_id: number | null;
  user_name: string | null;
  user_color: string | null;
}

export const toActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  subject: r.subject,
  message: r.message,
  createdAt: iso(r.created_at)!,
  jobId: r.job_id,
  user: r.user_id === null ? null : ({ id: r.user_id, name: r.user_name!, color: r.user_color! } satisfies Person),
});

export async function log(db: Db, at: Date, userId: number, subject: string, message: string, jobId: number | null = null): Promise<void> {
  await db.query('insert into activity (user_id, job_id, subject, message, created_at) values ($1, $2, $3, $4, $5)', [
    userId,
    jobId,
    subject,
    message,
    at,
  ]);
}

/** "Tue, Nov 17, 9:00 AM" in the company's time zone. */
export function when(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
