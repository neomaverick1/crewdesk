import { hashPassword } from './auth.ts';
import type { Db } from './db.ts';
import { localDate, zoned } from './time.ts';
import type { JobStatus, Priority, Role } from './types.ts';

// Demo data for a made-up home services company. Everything is placed relative to `now`, so the demo always shows
// a busy today, a full week ahead and six months of history. A seeded random generator keeps it the same every time.

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_USERS: { name: string; email: string; role: Role; color: string }[] = [
  { name: 'Dana Brooks', email: 'dana@brightside.example', role: 'owner', color: '#4f46e5' },
  { name: 'Marcus Lee', email: 'marcus@brightside.example', role: 'dispatcher', color: '#0891b2' },
  { name: 'Priya Shah', email: 'priya@brightside.example', role: 'technician', color: '#db2777' },
  { name: 'Tom Alvarez', email: 'tom@brightside.example', role: 'technician', color: '#ea580c' },
  { name: 'Jordan Kim', email: 'jordan@brightside.example', role: 'technician', color: '#16a34a' },
  { name: 'Sam Okafor', email: 'sam@brightside.example', role: 'technician', color: '#7c3aed' },
];

const CUSTOMERS: [string, string, string][] = [
  ['Avery Collins', '1842 W Maple St', 'Chicago'],
  ['Nina Patel', '615 Elm Ave', 'Evanston'],
  ['Lakeview Dental Studio', '3120 N Broadway', 'Chicago'],
  ['The Rossi Family', '927 Linden Ave', 'Oak Park'],
  ['Grace Thompson', '4410 N Paulina St', 'Chicago'],
  ['Hyde Park Bakery', '5302 S Harper Ave', 'Chicago'],
  ['Evan Murphy', '238 Hazel St', 'Skokie'],
  ['Sofia Hernandez', '1517 S Laflin St', 'Chicago'],
  ['Kwame Mensah', '7041 Cedar Ln', 'Berwyn'],
  ['Linda Park', '902 Ridge Ave', 'Evanston'],
  ['Oakwood Apartments', '1200 W Oakdale Ave', 'Chicago'],
  ['Marta Nowak', '3315 N Oleander Ave', 'Chicago'],
  ['Daniel Cohen', '4021 Grove St', 'Skokie'],
  ['Riverside Yoga', '2650 W Fullerton Ave', 'Chicago'],
  ['Chloe Martin', '614 S Kenilworth Ave', 'Oak Park'],
  ['Andre Williams', '8125 S Dante Ave', 'Chicago'],
  ['Megan O’Brien', '5543 W Gunnison St', 'Chicago'],
  ['Raj Gupta', '1739 Asbury Ave', 'Evanston'],
  ['Wicker Park Cafe', '1530 N Milwaukee Ave', 'Chicago'],
  ['Helen Zhang', '2214 S Wentworth Ave', 'Chicago'],
  ['Luis Romero', '1938 W 18th St', 'Chicago'],
  ['Olivia Bennett', '411 N Grove Ave', 'Oak Park'],
  ['Pilsen Print Shop', '1814 S Halsted St', 'Chicago'],
  ['Victor Petrov', '6247 N Kilbourn Ave', 'Chicago'],
];

// More households, generated from these lists, so job history spreads the way it would for a real company.
const FIRST = [
  'James',
  'Maria',
  'Robert',
  'Aisha',
  'Michael',
  'Jennifer',
  'David',
  'Fatima',
  'William',
  'Emily',
  'Carlos',
  'Hannah',
  'Joseph',
  'Mei',
  'Thomas',
  'Sarah',
  'Ahmed',
  'Laura',
  'Kevin',
  'Rosa',
  'Brian',
  'Priscilla',
  'Patrick',
  'Yuki',
  'Gregory',
  'Natalie',
  'Omar',
  'Diane',
  'Samuel',
  'Elena',
];
const LAST = [
  'Johnson',
  'Garcia',
  'Brown',
  'Nguyen',
  'Davis',
  'Lopez',
  'Wilson',
  'Kowalski',
  'Anderson',
  'Kim',
  'Taylor',
  'Rivera',
  'Moore',
  'Jackson',
  'Lee',
  'Walsh',
  'Harris',
  'Singh',
  'Clark',
  'Novak',
  'Lewis',
  'Ortiz',
  'Walker',
  'Hughes',
  'Young',
  'Carter',
  'Reyes',
  'Foster',
  'Murphy',
  'Sato',
];
const STREETS = [
  'N Sheffield Ave',
  'W Belmont Ave',
  'N Damen Ave',
  'W Addison St',
  'S Ashland Ave',
  'N Clark St',
  'W Armitage Ave',
  'N Western Ave',
  'W Irving Park Rd',
  'S Halsted St',
  'Main St',
  'Oak Ave',
  'Washington Blvd',
  'Lake St',
  'Central St',
  'Harrison St',
];
const CITIES = ['Chicago', 'Chicago', 'Chicago', 'Chicago', 'Evanston', 'Oak Park', 'Skokie', 'Berwyn', 'Cicero', 'Park Ridge'];
const HOUSEHOLDS = 96;

const SERVICES: { title: string; cents: number; minutes: number; parts: number }[] = [
  { title: 'AC tune-up', cents: 14900, minutes: 60, parts: 0 },
  { title: 'Furnace inspection', cents: 12900, minutes: 60, parts: 0 },
  { title: 'Water heater replacement', cents: 189000, minutes: 240, parts: 0.6 },
  { title: 'Leaky faucet repair', cents: 18900, minutes: 60, parts: 0.2 },
  { title: 'Drain cleaning', cents: 22900, minutes: 90, parts: 0 },
  { title: 'Smart thermostat install', cents: 27900, minutes: 90, parts: 0.5 },
  { title: 'Sump pump check', cents: 15900, minutes: 45, parts: 0 },
  { title: 'Garbage disposal replacement', cents: 42900, minutes: 120, parts: 0.5 },
  { title: 'Outlet and switch repair', cents: 17900, minutes: 60, parts: 0.15 },
  { title: 'Ceiling fan installation', cents: 24900, minutes: 90, parts: 0 },
  { title: 'Toilet repair', cents: 19900, minutes: 60, parts: 0.25 },
  { title: 'Dryer vent cleaning', cents: 13900, minutes: 60, parts: 0 },
  { title: 'Burst pipe repair', cents: 49900, minutes: 150, parts: 0.3 },
  { title: 'Smoke detector replacement', cents: 11900, minutes: 45, parts: 0.4 },
];

const NOTES = [
  'Side door, ring the bell twice.',
  'Dog in the yard, friendly.',
  'Park in the alley behind the building.',
  'Ask for the building manager at the front desk.',
  'Prefers a call 30 minutes before arrival.',
  '',
  '',
  '',
];

const SLOTS: [number, number][] = [
  [8, 0],
  [10, 30],
  [13, 0],
  [15, 30],
];

/** Small seeded random generator (mulberry32). */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function insert(db: Db, table: string, columns: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const values = chunk.map((row) => `(${row.map((v) => (params.push(v), `$${params.length}`)).join(', ')})`);
    await db.query(`insert into ${table} (${columns.join(', ')}) values ${values.join(', ')}`, params);
  }
}

export interface SeedOptions {
  now?: Date;
  timezone?: string;
  hashRounds?: number;
}

export async function seed(db: Db, { now = new Date(), timezone = 'America/Chicago', hashRounds }: SeedOptions = {}): Promise<void> {
  const rand = random(20261115);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const today = localDate(timezone, now);
  const at = (dayOffset: number, hh = 0, mm = 0) => zoned(timezone, today.y, today.m, today.d + dayOffset, hh, mm);
  const weekday = (dayOffset: number) => new Date(Date.UTC(today.y, today.m, today.d + dayOffset)).getUTCDay();
  const minutesAgo = (date: Date, mins: number) => new Date(date.getTime() - mins * 60000);

  // ---- people ----
  const hashes = await Promise.all(DEMO_USERS.map(() => hashPassword(DEMO_PASSWORD, hashRounds)));
  await insert(
    db,
    'users',
    ['id', 'name', 'email', 'role', 'password_hash', 'color', 'created_at'],
    DEMO_USERS.map((u, i) => [i + 1, u.name, u.email, u.role, hashes[i], u.color, at(-400)]),
  );
  const techs = DEMO_USERS.map((u, i) => ({ ...u, id: i + 1 })).filter((u) => u.role === 'technician');

  const names = new Set(CUSTOMERS.map(([n]) => n));
  const people: [string, string, string][] = [...CUSTOMERS];
  while (people.length < CUSTOMERS.length + HOUSEHOLDS) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (names.has(name)) continue;
    names.add(name);
    people.push([name, `${100 + Math.floor(rand() * 7900)} ${pick(STREETS)}`, pick(CITIES)]);
  }
  await insert(
    db,
    'customers',
    ['id', 'name', 'email', 'phone', 'address', 'city', 'notes', 'created_at'],
    people.map(([name, address, city], i) => {
      const business = /Studio|Bakery|Apartments|Yoga|Cafe|Shop/.test(name);
      const handle = name
        .toLowerCase()
        .replace(/^the /, '')
        .replace(/[^a-z]+/g, '.')
        .replace(/^\.|\.$/g, '');
      return [
        i + 1,
        name,
        business ? `office@${handle.replace(/\./g, '')}.example` : `${handle}@example.com`,
        `(${['312', '773', '847', '708'][i % 4]}) 555-${String(100 + i).padStart(4, '0')}`,
        address,
        city,
        pick(NOTES),
        at(-200 - i * 3),
      ];
    }),
  );

  // ---- jobs ----
  interface Job {
    id: number;
    customer: number;
    service: (typeof SERVICES)[number];
    status: JobStatus;
    priority: Priority;
    tech: number | null;
    start: Date | null;
    estimate: number;
    created: Date;
    completed: Date | null;
  }
  const jobs: Job[] = [];
  const nowMs = now.getTime();
  // Businesses and buildings call often; households now and then.
  const businesses = CUSTOMERS.flatMap(([name], i) => (/Studio|Bakery|Apartments|Yoga|Cafe|Shop/.test(name) ? [i + 1] : []));
  const customerFor = () => (rand() < 0.25 ? pick(businesses) : 1 + Math.floor(rand() * people.length));
  for (let day = -182; day <= 14; day++) {
    const wd = weekday(day);
    for (const [k, t] of techs.entries()) {
      // Weekdays are busy, Saturdays light, and on Sundays one technician is on call for urgent work.
      const onCall = (Math.abs(day) + 7) % techs.length === k;
      const count = wd === 0 ? (onCall ? 1 : 0) : wd === 6 ? (rand() < 0.4 ? 1 : 0) : Math.floor(rand() * 2.4) + 1;
      const slots = [...SLOTS]
        .sort(() => rand() - 0.5)
        .slice(0, count)
        .sort((a, b) => a[0] - b[0]);
      for (const [hh, mm] of slots) {
        const service = wd === 0 || rand() < 0.08 ? SERVICES[12] : pick(SERVICES);
        const start = at(day, hh, mm);
        const end = new Date(start.getTime() + service.minutes * 60000);
        let status: JobStatus;
        if (end.getTime() <= nowMs) status = rand() < 0.04 ? 'cancelled' : 'done';
        else if (start.getTime() <= nowMs) status = 'in_progress';
        else status = 'scheduled';
        const estimate = Math.round((service.cents * (0.9 + rand() * 0.4)) / 500) * 500;
        jobs.push({
          id: 0,
          customer: customerFor(),
          service,
          status,
          priority: service.title === 'Burst pipe repair' ? 'urgent' : rand() < 0.12 ? 'low' : 'normal',
          tech: t.id,
          start,
          estimate,
          created: minutesAgo(start, 60 * 24 * (1 + Math.floor(rand() * 10))),
          completed: status === 'done' ? new Date(end.getTime() + Math.floor(rand() * 20) * 60000) : null,
        });
      }
    }
  }
  // New requests waiting to be scheduled.
  for (let i = 0; i < 6; i++) {
    const service = pick(SERVICES);
    jobs.push({
      id: 0,
      customer: customerFor(),
      service,
      status: 'new',
      priority: i === 0 ? 'urgent' : 'normal',
      tech: null,
      start: null,
      estimate: service.cents,
      created: new Date(nowMs - (i + 1) * 5 * 3600000),
      completed: null,
    });
  }
  jobs.sort((a, b) => a.created.getTime() - b.created.getTime());
  jobs.forEach((j, i) => (j.id = i + 1));
  await insert(
    db,
    'jobs',
    [
      'id',
      'number',
      'customer_id',
      'title',
      'description',
      'status',
      'priority',
      'technician_id',
      'scheduled_at',
      'duration_minutes',
      'estimate_cents',
      'created_at',
      'updated_at',
      'completed_at',
    ],
    jobs.map((j) => [
      j.id,
      `JOB-${1000 + j.id}`,
      j.customer,
      j.service.title,
      j.status === 'new' ? 'Customer asked for the earliest available slot.' : '',
      j.status,
      j.priority,
      j.tech,
      j.start,
      j.service.minutes,
      j.estimate,
      j.created,
      j.completed ?? j.created,
      j.completed,
    ]),
  );

  // ---- invoices: one per finished job ----
  interface Invoice {
    id: number;
    job: Job;
    status: 'draft' | 'sent' | 'paid';
    total: number;
    issued: Date | null;
    paid: Date | null;
  }
  const invoices: Invoice[] = [];
  const lines: unknown[][] = [];
  for (const j of jobs.filter((x) => x.status === 'done').sort((a, b) => a.completed!.getTime() - b.completed!.getTime())) {
    const id = invoices.length + 1;
    const done = j.completed!;
    const ageDays = (nowMs - done.getTime()) / 86400000;
    const parts = Math.round((j.estimate * j.service.parts) / 100) * 100;
    const items: [string, number, number][] = [[`${j.service.title} · labor`, 1, j.estimate - parts]];
    if (parts) items.push(['Parts and materials', 1, parts]);
    if (rand() < 0.15) items.push(['After-hours call-out', 1, 6500]);
    items.forEach(([description, quantity, unit], position) => lines.push([id, position, description, quantity, unit]));
    const total = items.reduce((sum, [, q, u]) => sum + q * u, 0);

    // Fresh work is still being invoiced; most older invoices are paid within two weeks; a few run late.
    const r = rand();
    const issued = new Date(done.getTime() + 2 * 3600000);
    let invoice: Invoice;
    if (ageDays < 1.5 && r < 0.6) invoice = { id, job: j, status: 'draft', total, issued: null, paid: null };
    else if (ageDays > 14 && ageDays < 40 && r < 0.03) invoice = { id, job: j, status: 'sent', total, issued, paid: null };
    else {
      const paid = new Date(issued.getTime() + (0.5 + rand() * 12) * 86400000);
      invoice =
        paid.getTime() < nowMs
          ? { id, job: j, status: 'paid', total, issued, paid }
          : { id, job: j, status: 'sent', total, issued, paid: null };
    }
    invoices.push(invoice);
  }
  await insert(
    db,
    'invoices',
    ['id', 'number', 'customer_id', 'job_id', 'status', 'subtotal_cents', 'total_cents', 'issued_at', 'due_at', 'paid_at', 'created_at'],
    invoices.map((v) => [
      v.id,
      `INV-${2000 + v.id}`,
      v.job.customer,
      v.job.id,
      v.status,
      v.total,
      v.total,
      v.issued,
      v.issued ? new Date(v.issued.getTime() + 14 * 86400000) : null,
      v.paid,
      v.job.completed,
    ]),
  );
  await insert(db, 'invoice_lines', ['invoice_id', 'position', 'description', 'quantity', 'unit_cents'], lines);

  // ---- recent activity ----
  const office = 2; // Marcus, the dispatcher
  const events: [number, number | null, string, string, Date][] = [];
  const jobNumber = (j: Job) => `JOB-${1000 + j.id}`;
  const techName = (id: number | null) => DEMO_USERS[(id ?? 1) - 1].name;
  for (const j of jobs) {
    const age = nowMs - (j.completed ?? j.start ?? j.created).getTime();
    if (age > 4 * 86400000 || age < 0) continue;
    if (j.status === 'done') events.push([j.tech!, j.id, jobNumber(j), `completed ${jobNumber(j)} · ${j.service.title}`, j.completed!]);
    if (j.status === 'in_progress')
      events.push([j.tech!, j.id, jobNumber(j), `started ${jobNumber(j)}`, new Date(j.start!.getTime() + 5 * 60000)]);
    if (j.status === 'new')
      events.push([office, j.id, jobNumber(j), `created ${jobNumber(j)} · ${j.service.title} for ${people[j.customer - 1][0]}`, j.created]);
  }
  for (const j of jobs.filter((x) => x.status === 'scheduled').slice(0, 6))
    events.push([office, j.id, jobNumber(j), `assigned ${jobNumber(j)} to ${techName(j.tech)}`, minutesAgo(now, 30 + (j.id % 600))]);
  for (const v of invoices.filter((x) => x.paid && nowMs - x.paid.getTime() < 4 * 86400000))
    events.push([1, v.job.id, `INV-${2000 + v.id}`, `recorded payment for INV-${2000 + v.id} · $${(v.total / 100).toFixed(2)}`, v.paid!]);
  events.sort((a, b) => a[4].getTime() - b[4].getTime());
  await insert(
    db,
    'activity',
    ['user_id', 'job_id', 'subject', 'message', 'created_at'],
    events.map((e) => [e[0], e[1], e[2], e[3], e[4]]),
  );

  // Keep the id counters and numbering past the seeded rows.
  await db.query(`select setval('users_id_seq', (select max(id) from users)), setval('customers_id_seq', (select max(id) from customers)),
                         setval('jobs_id_seq', (select max(id) from jobs)), setval('invoices_id_seq', greatest((select max(id) from invoices), 1)),
                         setval('job_numbers', (select max(id) from jobs) + 1000), setval('invoice_numbers', greatest((select max(id) from invoices), 1) + 2000)`);
}
