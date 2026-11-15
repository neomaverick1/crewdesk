import { Hono } from 'hono';

import type { Env } from '../auth.ts';
import { ACTIVITY_SELECT, JOB_SELECT, toActivity, toJob, type ActivityRow, type Ctx, type JobRow } from '../context.ts';
import { first } from '../db.ts';
import { JOB_STATUSES, type Dashboard, type JobStatus, type Kpi } from '../types.ts';

interface Bounds {
  day: Date;
  week: Date;
  month: Date;
  prev_month: Date;
}

/** One request for the home screen. Owners and dispatchers see the business; technicians see their own work. */
export function dashboardRoutes({ db, now, org }: Ctx) {
  return new Hono<Env>().get('/', async (c) => {
    const user = c.get('user');
    const tech = user.role === 'technician';
    const at = now();
    const tz = org.timezone;

    // Start of today, this week (Monday) and this month in the company's time zone.
    const b = (await first<Bounds>(
      db,
      `select date_trunc('day', $1::timestamptz at time zone $2) at time zone $2 as day,
              date_trunc('week', $1::timestamptz at time zone $2) at time zone $2 as week,
              date_trunc('month', $1::timestamptz at time zone $2) at time zone $2 as month,
              (date_trunc('month', $1::timestamptz at time zone $2) - interval '1 month') at time zone $2 as prev_month`,
      [at, tz],
    ))!;
    const own = tech ? [user.id] : [];

    const counts = await db.query<{ status: JobStatus; n: number }>(
      `select j.status, count(*)::int as n from jobs j where true ${tech ? 'and j.technician_id = $1' : ''} group by j.status`,
      own,
    );
    const statusCounts = Object.fromEntries(JOB_STATUSES.map((s) => [s, counts.find((r) => r.status === s)?.n ?? 0])) as Record<
      JobStatus,
      number
    >;

    const today = (
      await db.query<JobRow>(
        `${JOB_SELECT} where j.scheduled_at >= $1 and j.scheduled_at < $1::timestamptz + interval '1 day' and j.status <> 'cancelled' ${tech ? 'and j.technician_id = $2' : ''} order by j.scheduled_at`,
        [b.day, ...own],
      )
    ).map((r) => toJob(r, at));

    const workload = await db.query<{ id: number; name: string; color: string; minutes: number; jobs: number }>(
      `select u.id, u.name, u.color, coalesce(sum(j.duration_minutes), 0)::int as minutes, count(j.id)::int as jobs
       from users u
       left join jobs j on j.technician_id = u.id and j.status <> 'cancelled' and j.scheduled_at >= $1 and j.scheduled_at < $1::timestamptz + interval '7 days'
       where u.role = 'technician' and u.active ${tech ? 'and u.id = $2' : ''}
       group by u.id order by u.name`,
      [b.week, ...own],
    );

    const activity = (
      await db.query<ActivityRow>(
        `${ACTIVITY_SELECT} ${tech ? 'join jobs j on j.id = a.job_id where j.technician_id = $1' : ''} order by a.created_at desc, a.id desc limit 12`,
        own,
      )
    ).map(toActivity);

    let kpis: Kpi[];
    let revenue: Dashboard['revenue'] = null;

    if (tech) {
      const s = (await first<{ week_jobs: number; week_minutes: number; done_month: number; active: number }>(
        db,
        `select count(*) filter (where scheduled_at >= $1 and scheduled_at < $1::timestamptz + interval '7 days' and status <> 'cancelled')::int as week_jobs,
                coalesce(sum(duration_minutes) filter (where scheduled_at >= $1 and scheduled_at < $1::timestamptz + interval '7 days' and status <> 'cancelled'), 0)::int as week_minutes,
                count(*) filter (where status = 'done' and completed_at >= $2)::int as done_month,
                count(*) filter (where status = 'in_progress')::int as active
         from jobs where technician_id = $3`,
        [b.week, b.month, user.id],
      ))!;
      kpis = [
        { label: 'Jobs today', value: today.length, kind: 'count', hint: `${today.filter((j) => j.status === 'done').length} done so far` },
        { label: 'Booked this week', value: s.week_minutes / 60, kind: 'count', hint: `hours across ${s.week_jobs} jobs` },
        { label: 'Completed this month', value: s.done_month, kind: 'count', hint: 'jobs marked done' },
        { label: 'In progress', value: s.active, kind: 'count', hint: s.active ? 'remember to mark them done' : 'nothing open right now' },
      ];
    } else {
      const m = (await first<{
        paid: number;
        paid_prev: number;
        open: number;
        open_n: number;
        overdue: number;
        overdue_n: number;
        unscheduled: number;
        week_jobs: number;
      }>(
        db,
        `select coalesce((select sum(total_cents) from invoices where status = 'paid' and paid_at >= $1), 0)::float8 as paid,
                coalesce((select sum(total_cents) from invoices where status = 'paid' and paid_at >= $2
                          and paid_at < $2::timestamptz + ($3::timestamptz - $1::timestamptz)), 0)::float8 as paid_prev,
                coalesce((select sum(total_cents) from invoices where status = 'sent'), 0)::float8 as open,
                (select count(*) from invoices where status = 'sent')::int as open_n,
                coalesce((select sum(total_cents) from invoices where status = 'sent' and due_at < $3), 0)::float8 as overdue,
                (select count(*) from invoices where status = 'sent' and due_at < $3)::int as overdue_n,
                (select count(*) from jobs where status = 'new')::int as unscheduled,
                (select count(*) from jobs where status <> 'cancelled' and scheduled_at >= $4 and scheduled_at < $4::timestamptz + interval '7 days')::int as week_jobs`,
        [b.month, b.prev_month, at, b.week],
      ))!;
      const change = m.paid_prev > 0 ? Math.round(((m.paid - m.paid_prev) / m.paid_prev) * 100) : null;
      kpis = [
        {
          label: 'Revenue this month',
          value: m.paid,
          kind: 'money',
          hint: change === null ? 'payments received' : `${change >= 0 ? '+' : ''}${change}% vs the same point last month`,
          tone: change === null ? undefined : change >= 0 ? 'good' : 'bad',
        },
        {
          label: 'Waiting to be paid',
          value: m.open,
          kind: 'money',
          hint: `${m.open_n} invoices, ${m.overdue_n} overdue`,
          tone: m.overdue_n ? 'bad' : undefined,
        },
        { label: 'Jobs today', value: today.length, kind: 'count', hint: `${m.week_jobs} booked this week` },
        {
          label: 'Need scheduling',
          value: m.unscheduled,
          kind: 'count',
          hint: m.unscheduled ? 'new requests to assign' : 'all caught up',
          tone: m.unscheduled ? 'bad' : 'good',
        },
      ];

      revenue = (
        await db.query<{ month: string; invoiced: number; paid: number }>(
          `with months as (
             select generate_series(date_trunc('month', $1::timestamptz at time zone $2) - interval '5 months',
                                    date_trunc('month', $1::timestamptz at time zone $2), interval '1 month') as m
           )
           select to_char(m, 'YYYY-MM') as month,
                  coalesce((select sum(total_cents) from invoices i where i.status in ('sent', 'paid')
                            and i.issued_at >= m at time zone $2 and i.issued_at < (m + interval '1 month') at time zone $2), 0)::float8 as invoiced,
                  coalesce((select sum(total_cents) from invoices i where i.status = 'paid'
                            and i.paid_at >= m at time zone $2 and i.paid_at < (m + interval '1 month') at time zone $2), 0)::float8 as paid
           from months order by m`,
          [at, tz],
        )
      ).map((r) => ({ month: r.month, invoicedCents: r.invoiced, paidCents: r.paid }));
    }

    const result: Dashboard = { kpis, revenue, statusCounts, workload, today, activity };
    return c.json(result);
  });
}
