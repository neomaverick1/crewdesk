# Crewdesk: full-stack business dashboard (React + Node.js API)

Crewdesk runs a field service business: **jobs, dispatch, a crew calendar, customers and invoices**, with separate **owner, dispatcher and technician** roles. It is a **React + TypeScript** web app on a **Node.js REST API** with **PostgreSQL**, built so the same API code runs on a server, in the tests, and in the browser for the live demo.

**Live demo:** [neomaverick1.github.io/crewdesk](https://neomaverick1.github.io/crewdesk/). Sign in with one click as the owner, the dispatcher or a technician. The demo has no server: the real API and a real PostgreSQL database ([PGlite](https://pglite.dev), Postgres compiled to WebAssembly) start inside your browser tab, so you can create jobs, drag them around the calendar and send invoices, and your changes stay in your browser.

<img src="docs/screenshots/dashboard.jpg" alt="Dashboard with revenue, open jobs, crew workload and today's schedule" width="100%">

<p>
  <img src="docs/screenshots/schedule.jpg" width="49%" alt="Crew calendar with drag and drop scheduling">
  <img src="docs/screenshots/jobs-board.jpg" width="49%" alt="Job board">
</p>
<p>
  <img src="docs/screenshots/invoice.jpg" width="49%" alt="Invoice with line items">
  <img src="docs/screenshots/job.jpg" width="49%" alt="Job details and history">
</p>
<p>
  <img src="docs/screenshots/customers.jpg" width="74%" alt="Customer list with balances">
  <img src="docs/screenshots/technician-phone.jpg" width="24%" alt="A technician's day on a phone">
</p>

Every push to `main` type-checks, lints and tests the code (on PGlite and on a real PostgreSQL 17), then rebuilds and redeploys the live demo ([`.github/workflows/build.yml`](.github/workflows/build.yml)).

## Features

| Area               | What it does                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**      | Revenue this month against the same point last month, money waiting to be paid and overdue, jobs today, requests waiting to be scheduled, six months of invoiced and paid revenue, open jobs by status, each technician's booked hours this week, today's jobs and a live activity feed. |
| **Job board**      | New, scheduled, in progress and done columns. Drag a card to change its status; a job that still needs a technician or a time opens the scheduling form instead. Search and filter by technician.                                                                                        |
| **Crew calendar**  | A week per technician. Drag jobs between days and people, or drop a new request onto someone's day to book it.                                                                                                                                                                           |
| **Jobs**           | Customer, technician, time, length, estimate, priority, notes for the visit and a full history of who did what.                                                                                                                                                                          |
| **Customers**      | Search and paging, open jobs, unpaid balance and last visit for each customer, with their jobs and invoices one click away.                                                                                                                                                              |
| **Invoices**       | Finished jobs become draft invoices with editable lines and tax. Send them, record payments, void them, print them. Drafts, sent, overdue and paid totals at a glance.                                                                                                                   |
| **Team and roles** | Owners manage the team and see everything. Dispatchers run jobs, customers and invoices. Technicians see only their own jobs and can start them, finish them and add notes. The API enforces all of it, not just the screens.                                                            |
| **Time zones**     | Days, weeks and months follow the company's time zone (Chicago in the demo), so "today" is the same for everyone, wherever they are.                                                                                                                                                     |
| **Phones**         | Every screen works on a phone; technicians get a simple day view with Start and Done buttons.                                                                                                                                                                                            |

## The API

All endpoints are under `/api` and take and return JSON. Sign in to get a token, then send it as `Authorization: Bearer <token>`.

| Method and path                                 | Who                                              | What                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`                              | anyone                                           | Email and password in, a 12-hour JWT, the user and the company settings out                             |
| `GET /me`                                       | signed in                                        | The current user and company settings                                                                   |
| `GET /dashboard`                                | signed in                                        | KPIs, revenue by month, open jobs, workload, today and recent activity (technicians get their own)      |
| `GET /jobs`                                     | signed in                                        | Filter by `status`, `technicianId`, `customerId`, `from`, `to` and `search` (technicians see their own) |
| `POST /jobs`                                    | owner, dispatcher                                | Create a job; with a technician and a time it is scheduled straight away                                |
| `GET /jobs/:id`                                 | signed in                                        | A job with its customer and history                                                                     |
| `PATCH /jobs/:id`                               | owner, dispatcher; technicians on their own jobs | Assign, schedule, change status or notes. Technicians may only change status and notes                  |
| `DELETE /jobs/:id`                              | owner, dispatcher                                | Delete a job that has no invoice                                                                        |
| `GET /customers`, `POST /customers`             | owner, dispatcher                                | Search and page customers with balances; add one                                                        |
| `GET /customers/:id`, `PATCH /customers/:id`    | owner, dispatcher                                | A customer with jobs and invoices; update any field                                                     |
| `DELETE /customers/:id`                         | owner                                            | Only customers without jobs                                                                             |
| `GET /invoices`, `POST /invoices`               | owner, dispatcher                                | List by `status` with totals; create a draft from a finished job                                        |
| `GET /invoices/:id`, `PATCH /invoices/:id`      | owner, dispatcher                                | An invoice with its lines; edit a draft's lines and tax                                                 |
| `POST /invoices/:id/send`, `/pay`, `/void`      | owner, dispatcher (void: owner)                  | Send with a due date, record payment, void                                                              |
| `GET /users`, `POST /users`, `PATCH /users/:id` | owner (dispatchers can list)                     | The team with this week's workload; add people, change roles, deactivate                                |
| `GET /activity`                                 | signed in                                        | The audit log (technicians see their own jobs)                                                          |

Errors always look the same, with field-level messages for forms:

```json
{ "error": { "code": "validation", "message": "Some fields need attention.", "fields": { "email": "Enter a valid email." } } }
```

Status codes: `400` invalid input, `401` not signed in, `403` wrong role, `404` not found (including other technicians' jobs), `409` a rule was broken (for example scheduling a job without a technician, or invoicing a job twice), `429` too many sign-in attempts.

**Security:** passwords are hashed with PBKDF2-SHA256 (600,000 rounds) through Web Crypto; tokens are signed JWTs and every request re-checks that the user is still active; every route checks the role; sign-in locks an email for 10 minutes after 5 wrong passwords; all SQL is parameterized; responses carry secure headers; money is stored in cents and rounded once per line.

## How it is built

- **API** ([`server/`](server)): [Hono](https://hono.dev) with [Zod](https://zod.dev) validation and plain, parameterized SQL. [`createApp({ db, secret })`](server/app.ts) is the whole API; it only needs a database and a signing secret, which is why the same code runs on Node ([`server/main.ts`](server/main.ts)), in the tests, and in the browser ([`web/src/lib/demo.ts`](web/src/lib/demo.ts)).
- **Database** ([`server/schema.ts`](server/schema.ts)): PostgreSQL. In production the API talks to it through `pg`; without `DATABASE_URL` it uses an embedded PGlite database in `./.data`, so it runs with nothing else installed.
- **Web app** ([`web/`](web)): React 19, TanStack Query, React Router, Tailwind CSS and Recharts. Request and response types are shared with the API ([`server/types.ts`](server/types.ts)), so both sides stay in step.
- **Demo data** ([`server/seed.ts`](server/seed.ts)): a made-up company with six people, 120 customers and six months of jobs and invoices, placed relative to today so there is always a busy day to look at.

## Run it

Requires Node 22.18 or newer (it runs the TypeScript server directly).

```bash
npm install
npm run dev        # API on http://localhost:8787 with demo data, web app on http://localhost:5173
npm run dev:demo   # or the browser-only demo, with no server at all
```

Sign in as `dana@brightside.example` (owner), `marcus@brightside.example` (dispatcher) or `priya@brightside.example` (technician). The password for all of them is `demo1234`.

### Production

```bash
npm run build
DATABASE_URL=postgres://user:password@host:5432/crewdesk JWT_SECRET=a-long-random-string npm start
```

`npm start` serves the API and the built web app together on one port. Settings:

| Variable                              | Default                                          |                                                         |
| ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `DATABASE_URL`                        | (embedded PGlite in `./.data`)                   | PostgreSQL connection string                            |
| `JWT_SECRET`                          | required in production                           | At least 16 random characters                           |
| `PORT`                                | `8787`                                           |                                                         |
| `COMPANY_NAME`, `TIMEZONE`, `TAX_BPS` | Brightside Home Services, `America/Chicago`, `0` | Company settings; tax in basis points (`1025` = 10.25%) |
| `SEED_DEMO`                           | `true`                                           | Set to `false` to start with an empty database          |

## Checks

```bash
npm run typecheck  # TypeScript, strict mode, server and web together
npm run lint       # Oxlint
npm test           # 17 API tests: sign-in and lockout, roles, dashboard, jobs, invoices, customers, team, time zones
TEST_DATABASE_URL=postgres://... npm test   # the same tests against a real PostgreSQL (CI does this)
```

## Project structure

```
server/
  app.ts            The API: routes, auth and error handling
  routes/           auth, dashboard, jobs, customers, invoices, team and activity
  auth.ts           Password hashing, tokens, role checks
  db.ts             The database interface, for pg and PGlite
  schema.ts         Tables, indexes and constraints
  seed.ts           Demo company and data
  time.ts           Company time zone helpers
  main.ts           Node server
web/src/
  pages/            Dashboard, Jobs, Schedule, Customers, Invoices, Team, Sign in, and the job, customer and invoice panels
  components/       Layout and UI building blocks
  lib/              API client, in-browser demo, queries, session, formatting
tests/api.test.ts   API tests
```

## Credits

[PGlite](https://pglite.dev) by ElectricSQL (Apache 2.0), [Lucide](https://lucide.dev) icons (ISC), Inter font (SIL Open Font License). Brightside Home Services, its people, customers and numbers are made up.

## License

MIT © 2026 Randy Kundinger
