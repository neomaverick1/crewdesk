import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

import { authenticate, type Env } from './auth.ts';
import type { Ctx } from './context.ts';
import type { Db } from './db.ts';
import { Problem } from './errors.ts';
import { authRoutes } from './routes/auth.ts';
import { customerRoutes } from './routes/customers.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { invoiceRoutes } from './routes/invoices.ts';
import { jobRoutes } from './routes/jobs.ts';
import { activityRoutes, teamRoutes } from './routes/team.ts';
import type { ApiError, Org } from './types.ts';

export const DEFAULT_ORG: Org = { name: 'Brightside Home Services', timezone: 'America/Chicago', currency: 'USD', taxBps: 0 };

export interface AppOptions {
  db: Db;
  secret: string;
  org?: Org;
  now?: () => Date;
  hashRounds?: number; // lower in tests
  onError?: (err: unknown) => void;
}

/**
 * The whole REST API as a Hono app. It only needs a database and a signing secret, so the same code runs on Node
 * (server/main.ts), in tests, and inside the browser for the live demo.
 */
export function createApp({ db, secret, org = DEFAULT_ORG, now = () => new Date(), hashRounds, onError }: AppOptions) {
  const ctx: Ctx = { db, now, org };
  const api = new Hono<Env>().basePath('/api');

  api.use(secureHeaders());
  api.get('/health', (c) => c.json({ ok: true }));
  api.route('/auth', authRoutes(ctx, secret));

  api.use('*', authenticate(db, secret));
  api.get('/me', (c) => c.json({ user: c.get('user'), org }));
  api.route('/dashboard', dashboardRoutes(ctx));
  api.route('/jobs', jobRoutes(ctx));
  api.route('/customers', customerRoutes(ctx));
  api.route('/invoices', invoiceRoutes(ctx));
  api.route('/users', teamRoutes(ctx, { hashRounds }));
  api.route('/activity', activityRoutes(ctx));

  api.notFound((c) => c.json<ApiError>({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404));
  api.onError((err, c) => {
    if (err instanceof Problem)
      return c.json<ApiError>({ error: { code: err.code, message: err.message, fields: err.fields } }, err.status);
    if (err instanceof HTTPException && err.status < 500)
      return c.json<ApiError>({ error: { code: 'bad_request', message: err.message } }, err.status);
    onError?.(err);
    return c.json<ApiError>({ error: { code: 'server_error', message: 'Something went wrong on our side.' } }, 500);
  });
  return api;
}
