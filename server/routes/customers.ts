import { Hono } from 'hono';
import { z } from 'zod';

import { allow, type Env } from '../auth.ts';
import { body, idParam, iso, invoiceStatus, JOB_SELECT, log, query, toJob, type Ctx, type JobRow } from '../context.ts';
import { first } from '../db.ts';
import { notFound, Problem } from '../errors.ts';
import type { Customer, CustomerDetail, CustomerRow, InvoiceRow, Page } from '../types.ts';

// '' and null both clear an optional field.
const blankToNull = (s: string | null) => (s ? s : null);
const fields = {
  name: z.string().trim().min(2, 'Enter the customer’s name.').max(120),
  email: z
    .union([z.email('Enter a valid email.'), z.literal('')])
    .nullable()
    .transform(blankToNull),
  phone: z.string().trim().max(40).nullable().transform(blankToNull),
  address: z.string().trim().min(3, 'Enter the street address.').max(200),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  notes: z.string().trim().max(2000),
};
const createInput = z.object({ ...fields, email: fields.email.optional(), phone: fields.phone.optional(), notes: fields.notes.optional() });
const patchInput = z.object(fields).partial();

const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const CUSTOMER_COLUMNS = 'c.id, c.name, c.email, c.phone, c.address, c.city, c.notes, c.created_at';
const AGGREGATES = `
  (select count(*) from jobs j where j.customer_id = c.id)::int as jobs,
  (select count(*) from jobs j where j.customer_id = c.id and j.status in ('new', 'scheduled', 'in_progress'))::int as open_jobs,
  coalesce((select sum(i.total_cents) from invoices i where i.customer_id = c.id and i.status = 'sent'), 0)::float8 as balance_cents,
  (select max(j.scheduled_at) from jobs j where j.customer_id = c.id and j.scheduled_at <= $1) as last_job_at`;

interface Row {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string;
  city: string;
  notes: string;
  created_at: Date;
  jobs: number;
  open_jobs: number;
  balance_cents: number;
  last_job_at: Date | null;
  total?: number;
}

const toCustomer = (r: Row): Customer => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  city: r.city,
  notes: r.notes,
  createdAt: iso(r.created_at)!,
});

const toRow = (r: Row): CustomerRow => ({
  ...toCustomer(r),
  jobs: r.jobs,
  openJobs: r.open_jobs,
  balanceCents: r.balance_cents,
  lastJobAt: iso(r.last_job_at),
});

/** Customers are managed by the office: owners and dispatchers. */
export function customerRoutes({ db, now }: Ctx) {
  return new Hono<Env>()
    .use(allow('owner', 'dispatcher'))
    .get('/', query(listQuery), async (c) => {
      const { search, page, pageSize } = c.req.valid('query');
      const rows = await db.query<Row>(
        `select ${CUSTOMER_COLUMNS}, ${AGGREGATES}, count(*) over ()::int as total
         from customers c
         where $2::text = '' or c.name ilike $3 or c.email ilike $3 or c.phone ilike $3 or c.address ilike $3 or c.city ilike $3
         order by lower(c.name) collate "C", c.id
         limit $4 offset $5`,
        [now(), search, `%${search}%`, pageSize, (page - 1) * pageSize],
      );
      const result: Page<CustomerRow> = { items: rows.map(toRow), total: rows[0]?.total ?? 0, page, pageSize };
      return c.json(result);
    })
    .post('/', body(createInput), async (c) => {
      const input = c.req.valid('json');
      const row = (await first<{ id: number }>(
        db,
        'insert into customers (name, email, phone, address, city, notes) values ($1, $2, $3, $4, $5, $6) returning id',
        [input.name, input.email ?? null, input.phone ?? null, input.address, input.city, input.notes ?? ''],
      ))!;
      await log(db, now(), c.get('user').id, input.name, `added customer ${input.name}`);
      return c.json(await detail(row.id), 201);
    })
    .get('/:id', async (c) => c.json(await detail(idParam(c, 'Customer'))))
    .patch('/:id', body(patchInput), async (c) => {
      const id = idParam(c, 'Customer');
      const input = c.req.valid('json');
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${key} = $${params.length}`);
      }
      if (sets.length) {
        params.push(id);
        const updated = await db.query(`update customers set ${sets.join(', ')} where id = $${params.length} returning id`, params);
        if (!updated.length) throw notFound('Customer');
      }
      return c.json(await detail(id));
    })
    .delete('/:id', allow('owner'), async (c) => {
      const id = idParam(c, 'Customer');
      const used = await first<{ n: number }>(db, 'select count(*)::int as n from jobs where customer_id = $1', [id]);
      if (used?.n) throw new Problem(409, 'in_use', 'This customer has jobs, so they can’t be deleted.');
      const gone = await db.query('delete from customers where id = $1 returning id', [id]);
      if (!gone.length) throw notFound('Customer');
      return c.body(null, 204);
    });

  async function detail(id: number): Promise<CustomerDetail> {
    const at = now();
    const r = await first<Row>(db, `select ${CUSTOMER_COLUMNS}, ${AGGREGATES} from customers c where c.id = $2`, [at, id]);
    if (!r) throw notFound('Customer');
    const jobs = await db.query<JobRow>(`${JOB_SELECT} where j.customer_id = $1 order by j.scheduled_at desc nulls first limit 20`, [id]);
    const invoices = await db.query<{
      id: number;
      number: string;
      status: string;
      total_cents: number;
      issued_at: Date | null;
      due_at: Date | null;
      paid_at: Date | null;
      created_at: Date;
      job_number: string | null;
    }>(
      `select i.id, i.number, i.status, i.total_cents, i.issued_at, i.due_at, i.paid_at, i.created_at, j.number as job_number
       from invoices i left join jobs j on j.id = i.job_id where i.customer_id = $1 order by i.created_at desc limit 20`,
      [id],
    );
    return {
      ...toRow(r),
      recentJobs: jobs.map((j) => toJob(j, at)),
      invoices: invoices.map((i): InvoiceRow => ({
        id: i.id,
        number: i.number,
        status: invoiceStatus(i.status, i.due_at, at),
        customer: { id: r.id, name: r.name },
        jobNumber: i.job_number,
        totalCents: i.total_cents,
        issuedAt: iso(i.issued_at),
        dueAt: iso(i.due_at),
        paidAt: iso(i.paid_at),
        createdAt: iso(i.created_at)!,
      })),
    };
  }
}
