import { Hono } from 'hono';
import { z } from 'zod';

import { issueToken, USER_COLUMNS, verifyPassword, type Env } from '../auth.ts';
import { body, type Ctx } from '../context.ts';
import { first } from '../db.ts';
import { Problem } from '../errors.ts';
import type { Session, User } from '../types.ts';

const login = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email.')),
  password: z.string().min(1, 'Enter your password.'),
});

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

/** Sign-in, with a lockout after repeated wrong passwords for the same email. */
export function authRoutes({ db, now, org }: Ctx, secret: string) {
  const failures = new Map<string, { count: number; since: number }>();

  return new Hono<Env>().post('/login', body(login), async (c) => {
    const { email, password } = c.req.valid('json');
    const t = now().getTime();
    const f = failures.get(email);
    if (f && t - f.since < WINDOW_MS && f.count >= MAX_FAILURES)
      throw new Problem(429, 'too_many_attempts', 'Too many attempts. Wait a few minutes and try again.');

    const row = await first<User & { password_hash: string }>(db, `select ${USER_COLUMNS}, password_hash from users where email = $1`, [
      email,
    ]);
    if (!row?.active || !(await verifyPassword(password, row.password_hash))) {
      const fresh = !f || t - f.since >= WINDOW_MS;
      failures.set(email, { count: fresh ? 1 : f.count + 1, since: fresh ? t : f.since });
      throw new Problem(401, 'invalid_login', 'That email and password don’t match an account.');
    }
    failures.delete(email);
    const { password_hash: _hash, ...user } = row;
    const session: Session = { token: await issueToken(user, secret), user, org };
    return c.json(session);
  });
}
