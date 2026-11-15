import { Hono } from 'hono';
import { z } from 'zod';

import { allow, type Env } from '../auth.ts';
import { body, idParam, invoiceStatus, iso, log, money, query, type Ctx } from '../context.ts';
import { first, type Db } from '../db.ts';
import { notFound, Problem } from '../errors.ts';
import type { InvoiceDetail, InvoiceLine, InvoiceList, InvoiceRow } from '../types.ts';

const line = z.object({
  description: z.string().trim().min(1, 'Describe the line.').max(200),
  quantity: z.number().positive('Must be more than 0.').max(10_000),
  unitCents: z.number().int().min(0).max(10_000_000),
});
const createInput = z
  .object({
    jobId: z.number().int().positive().optional(),
    customerId: z.number().int().positive().optional(),
    lines: z.array(line).min(1, 'Add at least one line.').max(50).optional(),
    taxBps: z.number().int().min(0).max(5000).optional(),
  })
  .refine((v) => v.jobId || v.customerId, { message: 'Pick a job or a customer.', path: ['jobId'] });
const patchInput = z
  .object({ lines: z.array(line).min(1, 'Add at least one line.').max(50), taxBps: z.number().int().min(0).max(5000) })
  .partial();
const sendInput = z.object({ dueInDays: z.number().int().min(0).max(120).optional() });
const listQuery = z.object({
  status: z.enum(['all', 'draft', 'sent', 'overdue', 'paid', 'void']).optional().default('all'),
  search: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

/** Subtotal, tax and total in cents, each rounded once. */
export function totals(lines: InvoiceLine[], taxBps: number) {
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitCents), 0);
  const tax = Math.round((subtotal * taxBps) / 10_000);
  return { subtotal, tax, total: subtotal + tax };
}

interface Row {
  id: number;
  number: string;
  status: string;
  total_cents: number;
  issued_at: Date | null;
  due_at: Date | null;
  paid_at: Date | null;
  created_at: Date;
  customer_id: number;
  customer_name: string;
  job_number: string | null;
  total?: number;
}

const ROW_SELECT = `
  select i.id, i.number, i.status, i.total_cents, i.issued_at, i.due_at, i.paid_at, i.created_at,
         c.id as customer_id, c.name as customer_name, j.number as job_number
  from invoices i join customers c on c.id = i.customer_id left join jobs j on j.id = i.job_id`;

const toRow = (r: Row, now: Date): InvoiceRow => ({
  id: r.id,
  number: r.number,
  status: invoiceStatus(r.status, r.due_at, now),
  customer: { id: r.customer_id, name: r.customer_name },
  jobNumber: r.job_number,
  totalCents: r.total_cents,
  issuedAt: iso(r.issued_at),
  dueAt: iso(r.due_at),
  paidAt: iso(r.paid_at),
  createdAt: iso(r.created_at)!,
});

/** Invoices are the office's job: owners and dispatchers. */
export function invoiceRoutes({ db, now, org }: Ctx) {
  async function saveLines(tx: Db, invoiceId: number, lines: InvoiceLine[], taxBps: number) {
    await tx.query('delete from invoice_lines where invoice_id = $1', [invoiceId]);
    for (const [i, l] of lines.entries())
      await tx.query('insert into invoice_lines (invoice_id, position, description, quantity, unit_cents) values ($1, $2, $3, $4, $5)', [
        invoiceId,
        i,
        l.description,
        l.quantity,
        l.unitCents,
      ]);
    const t = totals(lines, taxBps);
    await tx.query('update invoices set tax_bps = $1, subtotal_cents = $2, tax_cents = $3, total_cents = $4 where id = $5', [
      taxBps,
      t.subtotal,
      t.tax,
      t.total,
      invoiceId,
    ]);
  }

  async function detail(id: number): Promise<InvoiceDetail> {
    const at = now();
    const r = await first<
      Row & {
        job_id: number | null;
        tax_bps: number;
        subtotal_cents: number;
        tax_cents: number;
        email: string | null;
        phone: string | null;
        address: string;
        city: string;
        notes: string;
        customer_created_at: Date;
      }
    >(
      db,
      ROW_SELECT.replace(
        'select i.id,',
        'select i.job_id, i.tax_bps, i.subtotal_cents, i.tax_cents, c.email, c.phone, c.address, c.city, c.notes, c.created_at as customer_created_at, i.id,',
      ) + ' where i.id = $1',
      [id],
    );
    if (!r) throw notFound('Invoice');
    const lines = await db.query<{ description: string; quantity: number; unit_cents: number }>(
      'select description, quantity, unit_cents from invoice_lines where invoice_id = $1 order by position',
      [id],
    );
    return {
      ...toRow(r, at),
      jobId: r.job_id,
      taxBps: r.tax_bps,
      subtotalCents: r.subtotal_cents,
      taxCents: r.tax_cents,
      lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unit_cents })),
      customer: {
        id: r.customer_id,
        name: r.customer_name,
        email: r.email,
        phone: r.phone,
        address: r.address,
        city: r.city,
        notes: r.notes,
        createdAt: iso(r.customer_created_at)!,
      },
    };
  }

  async function load(id: number) {
    const inv = await first<{
      id: number;
      number: string;
      status: string;
      total_cents: number;
      customer_name: string;
      due_at: Date | null;
    }>(
      db,
      'select i.id, i.number, i.status, i.total_cents, i.due_at, c.name as customer_name from invoices i join customers c on c.id = i.customer_id where i.id = $1',
      [id],
    );
    if (!inv) throw notFound('Invoice');
    return inv;
  }

  return new Hono<Env>()
    .use(allow('owner', 'dispatcher'))
    .get('/', query(listQuery), async (c) => {
      const { status, search, page, pageSize } = c.req.valid('query');
      const at = now();
      const params: unknown[] = [];
      const p = (value: unknown) => (params.push(value), `$${params.length}`);
      const filter =
        status === 'all'
          ? 'true'
          : status === 'sent'
            ? `i.status = 'sent' and (i.due_at is null or i.due_at >= ${p(at)})`
            : status === 'overdue'
              ? `i.status = 'sent' and i.due_at < ${p(at)}`
              : `i.status = ${p(status)}`;
      const like = search ? p(`%${search}%`) : null;
      const rows = await db.query<Row>(
        `${ROW_SELECT.replace('select i.id,', 'select count(*) over ()::int as total, i.id,')}
         where ${filter} ${like ? `and (i.number ilike ${like} or c.name ilike ${like} or j.number ilike ${like})` : ''}
         order by coalesce(i.issued_at, i.created_at) desc, i.id desc limit ${p(pageSize)} offset ${p((page - 1) * pageSize)}`,
        params,
      );
      const sums = (await first<Record<string, number>>(
        db,
        `select count(*) filter (where status = 'draft')::int as draft_n, coalesce(sum(total_cents) filter (where status = 'draft'), 0)::float8 as draft_c,
                count(*) filter (where status = 'sent' and (due_at is null or due_at >= $1))::int as sent_n,
                coalesce(sum(total_cents) filter (where status = 'sent' and (due_at is null or due_at >= $1)), 0)::float8 as sent_c,
                count(*) filter (where status = 'sent' and due_at < $1)::int as overdue_n, coalesce(sum(total_cents) filter (where status = 'sent' and due_at < $1), 0)::float8 as overdue_c,
                count(*) filter (where status = 'paid')::int as paid_n, coalesce(sum(total_cents) filter (where status = 'paid'), 0)::float8 as paid_c
         from invoices`,
        [at],
      ))!;
      const result: InvoiceList = {
        items: rows.map((r) => toRow(r, at)),
        total: rows[0]?.total ?? 0,
        page,
        pageSize,
        totals: {
          draft: { count: sums.draft_n, cents: sums.draft_c },
          sent: { count: sums.sent_n, cents: sums.sent_c },
          overdue: { count: sums.overdue_n, cents: sums.overdue_c },
          paid: { count: sums.paid_n, cents: sums.paid_c },
        },
      };
      return c.json(result);
    })

    .post('/', body(createInput), async (c) => {
      const input = c.req.valid('json');
      const user = c.get('user');
      let customerId = input.customerId;
      let lines = input.lines;
      if (input.jobId) {
        const job = await first<{
          number: string;
          title: string;
          status: string;
          customer_id: number;
          estimate_cents: number;
          invoiced: number;
        }>(
          db,
          `select number, title, status, customer_id, estimate_cents,
                  (select count(*) from invoices where job_id = jobs.id and status <> 'void')::int as invoiced
           from jobs where id = $1`,
          [input.jobId],
        );
        if (!job) throw new Problem(400, 'validation', 'Some fields need attention.', { jobId: 'Pick a job.' });
        if (job.status !== 'done') throw new Problem(409, 'not_done', 'Finish the job before invoicing it.');
        if (job.invoiced) throw new Problem(409, 'already_invoiced', `${job.number} already has an invoice.`);
        customerId = job.customer_id;
        lines ??= [{ description: `${job.number} · ${job.title}`, quantity: 1, unitCents: job.estimate_cents }];
      } else if (!(await first(db, 'select 1 from customers where id = $1', [customerId]))) {
        throw new Problem(400, 'validation', 'Some fields need attention.', { customerId: 'Pick a customer.' });
      }
      if (!lines?.length) throw new Problem(400, 'validation', 'Some fields need attention.', { lines: 'Add at least one line.' });
      const id = await db.tx(async (tx) => {
        const row = (await first<{ id: number; number: string }>(
          tx,
          `insert into invoices (number, customer_id, job_id, status, created_at) values ('INV-' || nextval('invoice_numbers'), $1, $2, 'draft', $3) returning id, number`,
          [customerId, input.jobId ?? null, now()],
        ))!;
        await saveLines(tx, row.id, lines, input.taxBps ?? org.taxBps);
        await log(tx, now(), user.id, row.number, `drafted invoice ${row.number}`, input.jobId ?? null);
        return row.id;
      });
      return c.json(await detail(id), 201);
    })

    .get('/:id', async (c) => c.json(await detail(idParam(c, 'Invoice'))))

    .patch('/:id', body(patchInput), async (c) => {
      const id = idParam(c, 'Invoice');
      const input = c.req.valid('json');
      const inv = await load(id);
      if (inv.status !== 'draft') throw new Problem(409, 'not_draft', 'Only draft invoices can be edited.');
      const current = await detail(id);
      await db.tx((tx) => saveLines(tx, id, input.lines ?? current.lines, input.taxBps ?? current.taxBps));
      return c.json(await detail(id));
    })

    .post('/:id/send', body(sendInput), async (c) => {
      const id = idParam(c, 'Invoice');
      const inv = await load(id);
      if (inv.status !== 'draft') throw new Problem(409, 'not_draft', 'This invoice has already been sent.');
      if (inv.total_cents <= 0) throw new Problem(409, 'empty', 'Add an amount before sending.');
      const at = now();
      const due = new Date(at.getTime() + (c.req.valid('json').dueInDays ?? 14) * 86_400_000);
      await db.tx(async (tx) => {
        await tx.query(`update invoices set status = 'sent', issued_at = $1, due_at = $2 where id = $3`, [at, due, id]);
        await log(
          tx,
          now(),
          c.get('user').id,
          inv.number,
          `sent invoice ${inv.number} to ${inv.customer_name} · ${money(inv.total_cents)}`,
        );
      });
      return c.json(await detail(id));
    })

    .post('/:id/pay', async (c) => {
      const id = idParam(c, 'Invoice');
      const inv = await load(id);
      if (inv.status !== 'sent')
        throw new Problem(
          409,
          'not_sent',
          inv.status === 'paid' ? 'This invoice is already paid.' : 'Send the invoice before recording a payment.',
        );
      await db.tx(async (tx) => {
        await tx.query(`update invoices set status = 'paid', paid_at = $1 where id = $2`, [now(), id]);
        await log(tx, now(), c.get('user').id, inv.number, `recorded payment for ${inv.number} · ${money(inv.total_cents)}`);
      });
      return c.json(await detail(id));
    })

    .post('/:id/void', allow('owner'), async (c) => {
      const id = idParam(c, 'Invoice');
      const inv = await load(id);
      if (inv.status === 'paid' || inv.status === 'void')
        throw new Problem(409, 'final', `This invoice is ${inv.status}, so it can’t be voided.`);
      await db.tx(async (tx) => {
        await tx.query(`update invoices set status = 'void' where id = $1`, [id]);
        await log(tx, now(), c.get('user').id, inv.number, `voided ${inv.number}`);
      });
      return c.json(await detail(id));
    });
}
