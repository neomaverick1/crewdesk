import type { MiddlewareHandler } from 'hono';
import { sign, verify } from 'hono/jwt';

import { first, type Db } from './db.ts';
import { Problem } from './errors.ts';
import type { Role, User } from './types.ts';

// Passwords: PBKDF2-SHA256 through Web Crypto, which works the same in Node and in the browser demo.
const enc = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256),
  );
}

export async function hashPassword(password: string, iterations = 600_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !salt || !hash) return false;
  const actual = await derive(password, fromB64(salt), Number(rounds));
  const expected = fromB64(hash);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual[i] ^ expected[i];
  return diff === 0; // compared without stopping early, so timing gives nothing away
}

const TOKEN_HOURS = 12;

/** Tokens use the real clock (the API's clock can be moved in tests; token checks can't). */
export function issueToken(user: User, secret: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return sign({ sub: String(user.id), role: user.role, iat, exp: iat + TOKEN_HOURS * 3600 }, secret, 'HS256');
}

export type Env = { Variables: { user: User } };

export const USER_COLUMNS = 'id, name, email, role, color, active';

/** Reads the bearer token and loads the signed-in user, who must still be active. */
export function authenticate(db: Db, secret: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new Problem(401, 'unauthorized', 'Sign in to continue.');
    let sub: string;
    try {
      sub = String((await verify(token, secret, 'HS256')).sub);
    } catch {
      throw new Problem(401, 'unauthorized', 'Your session has expired. Sign in again.');
    }
    const user = await first<User>(db, `select ${USER_COLUMNS} from users where id = $1`, [Number(sub)]);
    if (!user?.active) throw new Problem(401, 'unauthorized', 'This account is no longer active.');
    c.set('user', user);
    await next();
  };
}

/** Lets only the given roles through. */
export function allow(...roles: Role[]): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!roles.includes(c.get('user').role)) throw new Problem(403, 'forbidden', 'Your role does not have access to this.');
    await next();
  };
}
