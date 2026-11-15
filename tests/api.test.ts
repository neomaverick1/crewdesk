import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../server/app.ts';
import { migrate, pgliteDb, poolDb, type Db } from '../server/db.ts';
import { totals } from '../server/routes/invoices.ts';
import { DEMO_PASSWORD, seed } from '../server/seed.ts';
import { fromLocalInput, toLocalInput, zoned } from '../server/time.ts';
import type {
  CustomerDetail,
  Dashboard,
  InvoiceDetail,
  InvoiceList,
  JobDetail,
  JobSummary,
  Page,
  CustomerRow,
  Session,
  TeamMember,
} from '../server/types.ts';

// Runs against PGlite (PostgreSQL in WebAssembly) by default, or a real PostgreSQL when TEST_DATABASE_URL is set,
// as it is in CI. Wednesday 10:00 in Chicago, so "today" has finished, running and upcoming jobs.
const NOW = zoned('America/Chicago', 2026, 10, 18, 10, 0);
let db: Db;
let close = async () => {};
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  if (process.env.TEST_DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    db = poolDb(pool);
    await db.exec('drop schema public cascade; create schema public;');
    close = () => pool.end();
  } else {
    const lite = await PGlite.create();
    db = pgliteDb(lite);
    close = () => lite.close();
  }
  await migrate(db);
  await seed(db, { now: NOW, hashRounds: 1000 });
  app = createApp({ db, secret: 'test-secret-that-is-long-enough', now: () => NOW, hashRounds: 1000 });
});
afterAll(() => close());

async function call<T = unknown>(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

const tokens: Record<string, string> = {};
async function signIn(email: string) {
  tokens[email] ??= (await call<Session>('POST', '/auth/login', { body: { email, password: DEMO_PASSWORD } })).body.token;
  return tokens[email];
}
const owner = () => signIn('dana@brightside.example');
const dispatcher = () => signIn('marcus@brightside.example');
const priya = () => signIn('priya@brightside.example');

describe('auth', () => {
  it('needs a token, and rejects bad ones', async () => {
    expect((await call('GET', '/health')).body).toEqual({ ok: true });
    expect((await call('GET', '/jobs')).status).toBe(401);
    expect((await call('GET', '/jobs', { token: 'nope' })).status).toBe(401);
  });

  it('signs in and returns the user and company settings', async () => {
    const res = await call<Session>('POST', '/auth/login', { body: { email: ' Dana@Brightside.example ', password: DEMO_PASSWORD } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Dana Brooks', role: 'owner' });
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body.org.timezone).toBe('America/Chicago');
    const me = await call<{ user: { email: string } }>('GET', '/me', { token: res.body.token });
    expect(me.body.user.email).toBe('dana@brightside.example');
  });

  it('locks an email out after five wrong passwords', async () => {
    const attempt = (password: string) => call('POST', '/auth/login', { body: { email: 'sam@brightside.example', password } });
    for (let i = 0; i < 5; i++) expect((await attempt('wrong')).status).toBe(401);
    expect((await attempt(DEMO_PASSWORD)).status).toBe(429);
  });

  it('validates input and reports each field', async () => {
    const res = await call<{ error: { code: string; fields: Record<string, string> } }>('POST', '/auth/login', {
      body: { email: 'not-an-email' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
    expect(Object.keys(res.body.error.fields)).toEqual(['email', 'password']);
    expect((await call('POST', '/auth/login', { body: '{oops' })).status).toBe(400);
  });
});

describe('roles', () => {
  it('keeps money and customers away from technicians', async () => {
    const t = await priya();
    expect((await call('GET', '/invoices', { token: t })).status).toBe(403);
    expect((await call('GET', '/customers', { token: t })).status).toBe(403);
    expect((await call('GET', '/users', { token: t })).status).toBe(403);
    expect(
      (
        await call('POST', '/users', {
          token: await dispatcher(),
          body: { name: 'X', email: 'x@y.example', role: 'owner', password: '12345678' },
        })
      ).status,
    ).toBe(403);
  });

  it('shows technicians only their own jobs, and only lets them change status and notes', async () => {
    const t = await priya();
    const mine = (await call<JobSummary[]>('GET', '/jobs', { token: t })).body;
    expect(mine.length).toBeGreaterThan(50);
    expect(new Set(mine.map((j) => j.technician?.name))).toEqual(new Set(['Priya Shah']));

    const all = (await call<JobSummary[]>('GET', '/jobs?status=scheduled', { token: await owner() })).body;
    const someoneElses = all.find((j) => j.technician?.name !== 'Priya Shah')!;
    expect((await call('GET', `/jobs/${someoneElses.id}`, { token: t })).status).toBe(404);

    const next = mine.find((j) => j.status === 'scheduled')!;
    expect((await call('PATCH', `/jobs/${next.id}`, { token: t, body: { title: 'Changed' } })).status).toBe(403);
    expect((await call('PATCH', `/jobs/${next.id}`, { token: t, body: { status: 'cancelled' } })).status).toBe(403);
    const started = await call<JobDetail>('PATCH', `/jobs/${next.id}`, {
      token: t,
      body: { status: 'in_progress', description: 'Gate code 4411' },
    });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ status: 'in_progress', description: 'Gate code 4411' });
    expect(started.body.activity[0]).toMatchObject({ message: `started ${next.number}`, user: { name: 'Priya Shah' } });
  });
});

describe('dashboard', () => {
  it('gives the office revenue, workload and today in the company time zone', async () => {
    const d = (await call<Dashboard>('GET', '/dashboard', { token: await owner() })).body;
    expect(d.kpis.map((k) => k.label)).toEqual(['Revenue this month', 'Waiting to be paid', 'Jobs today', 'Need scheduling']);
    expect(d.revenue).toHaveLength(6);
    expect(d.revenue!.at(-1)!.month).toBe('2026-11');
    expect(d.revenue!.every((m) => m.paidCents > 0)).toBe(true);
    expect(d.workload.map((w) => w.name)).toEqual(['Jordan Kim', 'Priya Shah', 'Sam Okafor', 'Tom Alvarez']);
    expect(d.today.length).toBeGreaterThan(3);
    const dayStart = zoned('America/Chicago', 2026, 10, 18).getTime();
    expect(
      d.today.every((j) => new Date(j.scheduledAt!).getTime() >= dayStart && new Date(j.scheduledAt!).getTime() < dayStart + 86400000),
    ).toBe(true);
    expect(d.statusCounts.new).toBe(6);
  });

  it('gives technicians their own day', async () => {
    const d = (await call<Dashboard>('GET', '/dashboard', { token: await signIn('tom@brightside.example') })).body;
    expect(d.revenue).toBeNull();
    expect(d.kpis[0].label).toBe('Jobs today');
    expect(d.workload.map((w) => w.name)).toEqual(['Tom Alvarez']);
    expect(d.today.every((j) => j.technician?.name === 'Tom Alvarez')).toBe(true);
  });
});

describe('jobs', () => {
  it('creates, schedules, completes and logs a job', async () => {
    const t = await dispatcher();
    const created = await call<JobDetail>('POST', '/jobs', {
      token: t,
      body: { customerId: 3, title: 'Replace kitchen faucet', estimateCents: 21500 },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'new', technician: null, number: expect.stringMatching(/^JOB-\d+$/) });

    const at = zoned('America/Chicago', 2026, 10, 19, 13, 0).toISOString();
    const scheduled = await call<JobDetail>('PATCH', `/jobs/${created.body.id}`, { token: t, body: { technicianId: 4, scheduledAt: at } });
    expect(scheduled.body).toMatchObject({ status: 'scheduled', scheduledAt: at, technician: { name: 'Tom Alvarez' } });
    expect(scheduled.body.activity.map((a) => a.message)).toEqual([
      `scheduled ${created.body.number} for Thu, Nov 19, 1:00 PM`,
      `assigned ${created.body.number} to Tom Alvarez`,
      `created ${created.body.number} · Replace kitchen faucet for Lakeview Dental Studio`,
    ]);

    const unassigned = await call<JobDetail>('PATCH', `/jobs/${created.body.id}`, { token: t, body: { technicianId: null } });
    expect(unassigned.body.status).toBe('new');
    expect((await call('PATCH', `/jobs/${created.body.id}`, { token: t, body: { status: 'scheduled' } })).status).toBe(409);
    expect((await call('PATCH', `/jobs/${created.body.id}`, { token: t, body: { technicianId: 1 } })).status).toBe(400); // the owner isn't a technician

    await call('PATCH', `/jobs/${created.body.id}`, { token: t, body: { technicianId: 4 } });
    const done = await call<JobDetail>('PATCH', `/jobs/${created.body.id}`, { token: t, body: { status: 'done' } });
    expect(done.body.status).toBe('done');
    expect(done.body.completedAt).toBe(NOW.toISOString());
  });

  it('filters by status, technician, dates and text', async () => {
    const t = await owner();
    const from = zoned('America/Chicago', 2026, 10, 16).toISOString();
    const to = zoned('America/Chicago', 2026, 10, 23).toISOString();
    const week = (await call<JobSummary[]>('GET', `/jobs?from=${from}&to=${to}&technicianId=5`, { token: t })).body;
    expect(week.length).toBeGreaterThan(3);
    expect(week.every((j) => j.technician!.id === 5 && j.scheduledAt! >= from && j.scheduledAt! < to)).toBe(true);
    const fresh = (await call<JobSummary[]>('GET', '/jobs?status=new', { token: t })).body;
    expect(fresh.every((j) => j.status === 'new' && j.scheduledAt === null)).toBe(true);
    const search = (await call<JobSummary[]>('GET', '/jobs?search=wicker', { token: t })).body;
    expect(search.length).toBeGreaterThan(0);
    expect(search.every((j) => j.customer.name === 'Wicker Park Cafe')).toBe(true);
    expect((await call('GET', '/jobs?status=bogus', { token: t })).status).toBe(400);
  });
});

describe('invoices', () => {
  it('invoices a finished job, sends it and records the payment', async () => {
    const t = await dispatcher();
    const job = (
      await call<JobDetail>('POST', '/jobs', {
        token: t,
        body: { customerId: 5, title: 'Thermostat swap', estimateCents: 18950, technicianId: 3, scheduledAt: NOW.toISOString() },
      })
    ).body;
    expect((await call('POST', '/invoices', { token: t, body: { jobId: job.id } })).status).toBe(409); // not done yet
    await call('PATCH', `/jobs/${job.id}`, { token: t, body: { status: 'done' } });

    const draft = await call<InvoiceDetail>('POST', '/invoices', { token: t, body: { jobId: job.id } });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ status: 'draft', totalCents: 18950, customer: { name: 'Grace Thompson' }, jobNumber: job.number });
    expect((await call('POST', '/invoices', { token: t, body: { jobId: job.id } })).status).toBe(409); // one per job

    const edited = await call<InvoiceDetail>('PATCH', `/invoices/${draft.body.id}`, {
      token: t,
      body: {
        taxBps: 1025,
        lines: [
          { description: 'Labor', quantity: 1.5, unitCents: 9900 },
          { description: 'Thermostat', quantity: 1, unitCents: 12999 },
        ],
      },
    });
    expect(edited.body).toMatchObject({ subtotalCents: 27849, taxCents: 2855, totalCents: 30704 });

    const sent = await call<InvoiceDetail>('POST', `/invoices/${draft.body.id}/send`, { token: t, body: { dueInDays: 7 } });
    expect(sent.body.status).toBe('sent');
    expect(new Date(sent.body.dueAt!).getTime() - NOW.getTime()).toBe(7 * 86400000);
    expect((await call('PATCH', `/invoices/${draft.body.id}`, { token: t, body: { taxBps: 0 } })).status).toBe(409);

    const paid = await call<InvoiceDetail>('POST', `/invoices/${draft.body.id}/pay`, { token: t });
    expect(paid.body).toMatchObject({ status: 'paid', paidAt: NOW.toISOString() });
    expect((await call('POST', `/invoices/${draft.body.id}/void`, { token: await owner() })).status).toBe(409);
    expect((await call('POST', `/invoices/${draft.body.id}/void`, { token: t })).status).toBe(403);
  });

  it('lists by status with totals, and marks late invoices overdue', async () => {
    const t = await owner();
    const res = await call<InvoiceList>('GET', '/invoices?status=overdue&pageSize=100', { token: t });
    if (res.status !== 200) throw new Error(JSON.stringify(res.body));
    const overdue = res.body;
    expect(overdue.items.length).toBeGreaterThan(0);
    expect(overdue.items.every((i) => i.status === 'overdue' && new Date(i.dueAt!) < NOW)).toBe(true);
    expect(overdue.total).toBe(overdue.totals.overdue.count);
    const paid = (await call<InvoiceList>('GET', '/invoices?status=paid&page=2&pageSize=10', { token: t })).body;
    expect(paid.items).toHaveLength(10);
    expect(paid.page).toBe(2);
  });

  it('rounds money once per line and once for tax', () => {
    expect(totals([{ description: 'a', quantity: 0.333, unitCents: 1000 }], 825)).toEqual({ subtotal: 333, tax: 27, total: 360 });
  });
});

describe('customers', () => {
  it('searches, pages and shows balances', async () => {
    const t = await owner();
    const page = (await call<Page<CustomerRow>>('GET', '/customers?pageSize=10', { token: t })).body;
    expect(page.total).toBe(120);
    expect(page.items).toHaveLength(10);
    const names = page.items.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)));
    const found = (await call<Page<CustomerRow>>('GET', '/customers?search=evanston&pageSize=100', { token: t })).body;
    expect(found.items.length).toBeGreaterThan(3);
    expect(found.items.every((c) => c.city === 'Evanston')).toBe(true);
    const bakery = (await call<Page<CustomerRow>>('GET', '/customers?search=bakery', { token: t })).body.items[0];
    expect(bakery.jobs).toBeGreaterThan(20); // businesses call often
  });

  it('creates, updates part of a record and refuses to delete customers with jobs', async () => {
    const t = await dispatcher();
    const made = await call<CustomerDetail>('POST', '/customers', {
      token: t,
      body: { name: 'June Alvarez', email: '', phone: '(312) 555-0199', address: '77 W Polk St', city: 'Chicago' },
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ email: null, phone: '(312) 555-0199', jobs: 0, notes: '' });
    const updated = await call<CustomerDetail>('PATCH', `/customers/${made.body.id}`, { token: t, body: { notes: 'Back gate' } });
    expect(updated.body).toMatchObject({ notes: 'Back gate', phone: '(312) 555-0199', name: 'June Alvarez' });
    expect((await call('DELETE', `/customers/${made.body.id}`, { token: t })).status).toBe(403); // owners only
    expect((await call('DELETE', '/customers/1', { token: await owner() })).status).toBe(409);
    expect((await call('DELETE', `/customers/${made.body.id}`, { token: await owner() })).status).toBe(204);
  });
});

describe('team', () => {
  it('lets the owner add, change and deactivate people', async () => {
    const t = await owner();
    const added = await call<TeamMember>('POST', '/users', {
      token: t,
      body: { name: 'Riley Evans', email: 'riley@brightside.example', role: 'technician', password: 'longpassword' },
    });
    expect(added.status).toBe(201);
    expect(
      (
        await call('POST', '/users', {
          token: t,
          body: { name: 'Riley Two', email: 'riley@brightside.example', role: 'technician', password: 'longpassword' },
        })
      ).status,
    ).toBe(409);
    const login = await call<Session>('POST', '/auth/login', { body: { email: 'riley@brightside.example', password: 'longpassword' } });
    expect(login.status).toBe(200);

    expect((await call('PATCH', '/users/1', { token: t, body: { active: false } })).status).toBe(409); // not yourself
    expect((await call('PATCH', `/users/${added.body.id}`, { token: t, body: { active: false } })).status).toBe(200);
    expect((await call('GET', '/me', { token: login.body.token })).status).toBe(401);

    const team = (await call<TeamMember[]>('GET', '/users', { token: await dispatcher() })).body;
    expect(team[0]).toMatchObject({ role: 'owner', name: 'Dana Brooks' });
    expect(team.find((m) => m.name === 'Jordan Kim')!.jobsThisWeek).toBeGreaterThan(0);
  });
});

describe('time zones', () => {
  it('turns company wall-clock times into moments and back, across daylight saving', () => {
    expect(zoned('America/Chicago', 2026, 10, 18, 10, 0).toISOString()).toBe('2026-11-18T16:00:00.000Z'); // CST, UTC-6
    expect(zoned('America/Chicago', 2026, 6, 1, 10, 0).toISOString()).toBe('2026-07-01T15:00:00.000Z'); // CDT, UTC-5
    expect(fromLocalInput('2026-03-08T12:00', 'America/Chicago').toISOString()).toBe('2026-03-08T17:00:00.000Z'); // the day clocks change
    expect(toLocalInput('2026-11-18T16:00:00.000Z', 'America/Chicago')).toBe('2026-11-18T10:00');
  });
});
