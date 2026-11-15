import { Hono } from 'hono';
import { z } from 'zod';

import { allow, type Env } from '../auth.ts';
import {
  ACTIVITY_SELECT,
  body,
  idParam,
  iso,
  JOB_SELECT,
  log,
  query,
  toActivity,
  toJob,
  when,
  type ActivityRow,
  type Ctx,
  type JobRow,
} from '../context.ts';
import { first, type Db } from '../db.ts';
import { notFound, Problem } from '../errors.ts';
import { JOB_STATUSES, PRIORITIES, type JobDetail, type JobStatus, type User } from '../types.ts';

const fields = {
  customerId: z.number().int().positive(),
  title: z.string().trim().min(3, 'Describe the job in a few words.').max(120),
  description: z.string().trim().max(4000),
  priority: z.enum(PRIORITIES),
  technicianId: z.number().int().positive().nullable(),
  scheduledAt: z.iso.datetime({ offset: true, message: 'Pick a date and time.' }).nullable(),
  durationMinutes: z.number().int().min(15, 'At least 15 minutes.').max(600, 'At most 10 hours.'),
  estimateCents: z.number().int().min(0).max(10_000_000),
};
const createInput = z.object({
  customerId: fields.customerId,
  title: fields.title,
  description: fields.description.optional(),
  priority: fields.priority.optional(),
  technicianId: fields.technicianId.optional(),
  scheduledAt: fields.scheduledAt.optional(),
  durationMinutes: fields.durationMinutes.optional(),
  estimateCents: fields.estimateCents.optional(),
});
const patchInput = z
  .object({ ...fields, status: z.enum(JOB_STATUSES) })
  .omit({ customerId: true })
  .partial();

const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : []))
    .pipe(z.array(z.enum(JOB_STATUSES))),
  technicianId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  search: z.string().trim().max(100).optional(),
});

// What a technician may change on their own jobs.
const TECH_FIELDS = new Set(['status', 'description']);
const TECH_STATUSES = new Set<JobStatus>(['scheduled', 'in_progress', 'done']);

interface Raw {
  id: number;
  number: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: string;
  technician_id: number | null;
  scheduled_at: Date | null;
  duration_minutes: number;
  estimate_cents: number;
  completed_at: Date | null;
  invoice_status: string | null;
}

export function jobRoutes({ db, now, org }: Ctx) {
  const technician = async (id: number) => {
    const t = await first<User>(db, `select id, name, role, active from users where id = $1`, [id]);
    if (!t || t.role !== 'technician' || !t.active)
      throw new Problem(400, 'validation', 'Some fields need attention.', { technicianId: 'Pick an active technician.' });
    return t;
  };

  return new Hono<Env>()
    .get('/', query(listQuery), async (c) => {
      const q = c.req.valid('query');
      const user = c.get('user');
      const where: string[] = [];
      const params: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
      };
      if (user.role === 'technician') add('j.technician_id = ?', user.id);
      else if (q.technicianId) add('j.technician_id = ?', q.technicianId);
      if (q.customerId) add('j.customer_id = ?', q.customerId);
      if (q.status.length) add('j.status = any(?)', q.status);
      if (q.from) add('j.scheduled_at >= ?', q.from);
      if (q.to) add('j.scheduled_at < ?', q.to);
      if (q.search) {
        params.push(`%${q.search}%`);
        const p = `$${params.length}`;
        where.push(`(j.number ilike ${p} or j.title ilike ${p} or c.name ilike ${p} or c.address ilike ${p})`);
      }
      const rows = await db.query<JobRow>(
        `${JOB_SELECT} ${where.length ? `where ${where.join(' and ')}` : ''}
         order by j.scheduled_at nulls first, j.id desc limit 500`,
        params,
      );
      const at = now();
      return c.json(rows.map((r) => toJob(r, at)));
    })

    .post('/', allow('owner', 'dispatcher'), body(createInput), async (c) => {
      const input = c.req.valid('json');
      const user = c.get('user');
      const customer = await first<{ name: string }>(db, 'select name from customers where id = $1', [input.customerId]);
      if (!customer) throw new Problem(400, 'validation', 'Some fields need attention.', { customerId: 'Pick a customer.' });
      const tech = input.technicianId ? await technician(input.technicianId) : null;
      const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      const status: JobStatus = tech && scheduledAt ? 'scheduled' : 'new';
      const id = await db.tx(async (tx) => {
        const row = (await first<{ id: number; number: string }>(
          tx,
          `insert into jobs (number, customer_id, title, description, status, priority, technician_id, scheduled_at, duration_minutes, estimate_cents)
           values ('JOB-' || nextval('job_numbers'), $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, number`,
          [
            input.customerId,
            input.title,
            input.description ?? '',
            status,
            input.priority ?? 'normal',
            tech?.id ?? null,
            scheduledAt,
            input.durationMinutes ?? 60,
            input.estimateCents ?? 0,
          ],
        ))!;
        await log(tx, now(), user.id, row.number, `created ${row.number} · ${input.title} for ${customer.name}`, row.id);
        if (tech && scheduledAt)
          await log(
            tx,
            now(),
            user.id,
            row.number,
            `scheduled ${row.number} with ${tech.name} for ${when(scheduledAt, org.timezone)}`,
            row.id,
          );
        return row.id;
      });
      return c.json(await detail(db, id, user), 201);
    })

    .get('/:id', async (c) => c.json(await detail(db, idParam(c, 'Job'), c.get('user'))))

    .patch('/:id', body(patchInput), async (c) => {
      const id = idParam(c, 'Job');
      const input = c.req.valid('json');
      const user = c.get('user');
      const isTech = user.role === 'technician';
      const job = await first<Raw>(
        db,
        `select j.*, i.status as invoice_status from jobs j left join invoices i on i.job_id = j.id and i.status <> 'void' where j.id = $1`,
        [id],
      );
      if (!job || (isTech && job.technician_id !== user.id)) throw notFound('Job');
      if (isTech && Object.keys(input).some((k) => !TECH_FIELDS.has(k)))
        throw new Problem(403, 'forbidden', 'Technicians can update the status and notes of their own jobs.');
      if (isTech && input.status && !TECH_STATUSES.has(input.status))
        throw new Problem(403, 'forbidden', 'Ask the office to cancel or reopen a job.');

      const techId = input.technicianId !== undefined ? input.technicianId : job.technician_id;
      const tech = techId && techId !== job.technician_id ? await technician(techId) : null;
      const scheduledAt = input.scheduledAt !== undefined ? (input.scheduledAt ? new Date(input.scheduledAt) : null) : job.scheduled_at;
      let status = input.status ?? job.status;
      if (!input.status) {
        // Assigning a technician and a time schedules a new job; removing either sends it back.
        if (status === 'new' && techId && scheduledAt) status = 'scheduled';
        if (status === 'scheduled' && (!techId || !scheduledAt)) status = 'new';
      }
      if (status === 'scheduled' && (!techId || !scheduledAt))
        throw new Problem(409, 'needs_schedule', 'Pick a technician and a time before scheduling.');
      if ((status === 'in_progress' || status === 'done') && !techId)
        throw new Problem(409, 'needs_technician', 'Assign a technician first.');
      if (status !== job.status && job.invoice_status === 'paid')
        throw new Problem(409, 'invoiced', 'This job’s invoice is paid, so its status is final.');
      if (status === 'cancelled' && job.invoice_status) throw new Problem(409, 'invoiced', 'Void the invoice before cancelling this job.');

      const completedAt = status === 'done' ? (job.status === 'done' ? job.completed_at : now()) : null;
      await db.tx(async (tx) => {
        await tx.query(
          `update jobs set title = $1, description = $2, priority = $3, technician_id = $4, scheduled_at = $5, duration_minutes = $6,
                  estimate_cents = $7, status = $8, completed_at = $9, updated_at = $10 where id = $11`,
          [
            input.title ?? job.title,
            input.description ?? job.description,
            input.priority ?? job.priority,
            techId,
            scheduledAt,
            input.durationMinutes ?? job.duration_minutes,
            input.estimateCents ?? job.estimate_cents,
            status,
            completedAt,
            now(),
            id,
          ],
        );
        const n = job.number;
        if (techId !== job.technician_id) await log(tx, now(), user.id, n, tech ? `assigned ${n} to ${tech.name}` : `unassigned ${n}`, id);
        const moved = (scheduledAt?.getTime() ?? null) !== (job.scheduled_at ? new Date(job.scheduled_at).getTime() : null);
        if (moved && scheduledAt) await log(tx, now(), user.id, n, `scheduled ${n} for ${when(scheduledAt, org.timezone)}`, id);
        if (status !== job.status) {
          const message =
            status === 'in_progress'
              ? `started ${n}`
              : status === 'done'
                ? `completed ${n} · ${job.title}`
                : status === 'cancelled'
                  ? `cancelled ${n}`
                  : job.status === 'done' || job.status === 'cancelled'
                    ? `reopened ${n}`
                    : null;
          if (message) await log(tx, now(), user.id, n, message, id);
        }
      });
      return c.json(await detail(db, id, user));
    })

    .delete('/:id', allow('owner', 'dispatcher'), async (c) => {
      const id = idParam(c, 'Job');
      const invoiced = await first<{ n: number }>(db, `select count(*)::int as n from invoices where job_id = $1 and status <> 'void'`, [
        id,
      ]);
      if (invoiced?.n) throw new Problem(409, 'invoiced', 'This job has an invoice, so it can’t be deleted.');
      const gone = await db.tx(async (tx) => {
        await tx.query('delete from invoices where job_id = $1', [id]);
        return tx.query('delete from jobs where id = $1 returning id', [id]);
      });
      if (!gone.length) throw notFound('Job');
      return c.body(null, 204);
    });

  async function detail(db: Db, id: number, user: User): Promise<JobDetail> {
    const at = now();
    const row = await first<
      JobRow & {
        description: string;
        created_at: Date;
        completed_at: Date | null;
        technician_id: number | null;
        email: string | null;
        phone: string | null;
        notes: string;
        customer_created_at: Date;
      }
    >(
      db,
      JOB_SELECT.replace(
        'select j.id,',
        'select j.description, j.created_at, j.completed_at, j.technician_id, c.email, c.phone, c.notes, c.created_at as customer_created_at, j.id,',
      ) + ' where j.id = $1',
      [id],
    );
    if (!row || (user.role === 'technician' && row.technician_id !== user.id)) throw notFound('Job');
    const activity = await db.query<ActivityRow>(`${ACTIVITY_SELECT} where a.job_id = $1 order by a.created_at desc, a.id desc limit 30`, [
      id,
    ]);
    const summary = toJob(row, at);
    return {
      ...summary,
      description: row.description,
      createdAt: iso(row.created_at)!,
      completedAt: iso(row.completed_at),
      customer: {
        ...summary.customer,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
        createdAt: iso(row.customer_created_at)!,
      },
      activity: activity.map(toActivity),
    };
  }
}
