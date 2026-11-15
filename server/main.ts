// Runs the API on Node. With DATABASE_URL it uses PostgreSQL; without it, an embedded PGlite database in ./.data,
// so `npm run dev` works with nothing else installed. In production it also serves the built web app.
import { PGlite } from '@electric-sql/pglite';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import pg from 'pg';

import { createApp, DEFAULT_ORG } from './app.ts';
import { migrate, pgliteDb, poolDb, type Db } from './db.ts';
import { seed } from './seed.ts';
import type { Org } from './types.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
const secret = env.JWT_SECRET ?? (production ? '' : 'development-only-secret');
if (secret.length < 16) throw new Error('Set JWT_SECRET to a random string of at least 16 characters.');

const org: Org = {
  name: env.COMPANY_NAME ?? DEFAULT_ORG.name,
  timezone: env.TIMEZONE ?? DEFAULT_ORG.timezone,
  currency: 'USD',
  taxBps: Number(env.TAX_BPS ?? DEFAULT_ORG.taxBps),
};

const db: Db = env.DATABASE_URL
  ? poolDb(new pg.Pool({ connectionString: env.DATABASE_URL }))
  : pgliteDb(await PGlite.create(env.PGLITE_DIR ?? './.data/pglite'));

if ((await migrate(db)) && env.SEED_DEMO !== 'false') {
  await seed(db, { timezone: org.timezone });
  console.log('Loaded the demo data. Sign in as dana@brightside.example with the password demo1234.');
}

const app = new Hono();
app.use(logger());
app.route('/', createApp({ db, secret, org, onError: (err) => console.error(err) }));
if (production) app.use('/*', serveStatic({ root: './dist' }));

serve({ fetch: app.fetch, port: Number(env.PORT ?? 8787) }, (info) =>
  console.log(`Crewdesk API listening on http://localhost:${info.port}`),
);
