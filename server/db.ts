import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { Pool, PoolClient } from 'pg';

import { SCHEMA } from './schema.ts';

/**
 * The few database calls the API needs. Production uses PostgreSQL through `pg`; tests and the in-browser demo use
 * PGlite, which is PostgreSQL compiled to WebAssembly. Same SQL, same results.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export function pgliteDb(pg: PGlite | Transaction): Db {
  const db: Db = {
    query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows,
    exec: async (sql) => {
      await pg.exec(sql);
    },
    // A Transaction can't open another one, so nested calls simply join it.
    tx: (fn) => ('transaction' in pg ? pg.transaction((t) => fn(pgliteDb(t))) : fn(db)),
  };
  return db;
}

export function poolDb(pool: Pool): Db {
  const wrap = (client: Pool | PoolClient, inTx: boolean): Db => ({
    query: async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[],
    exec: async (sql) => {
      await client.query(sql);
    },
    tx: async (fn) => {
      if (inTx) return fn(wrap(client, true));
      const c = await pool.connect();
      try {
        await c.query('begin');
        const result = await fn(wrap(c, true));
        await c.query('commit');
        return result;
      } catch (err) {
        await c.query('rollback');
        throw err;
      } finally {
        c.release();
      }
    },
  });
  return wrap(pool, false);
}

/** Creates the tables on an empty database. Returns true when it did. */
export async function migrate(db: Db): Promise<boolean> {
  await db.exec('create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())');
  const done = await db.query<{ version: number }>('select version from schema_migrations where version = 1');
  if (done.length) return false;
  await db.tx(async (tx) => {
    await tx.exec(SCHEMA);
    await tx.query('insert into schema_migrations (version) values (1)');
  });
  return true;
}

/** First row or undefined. */
export async function first<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query<T>(sql, params))[0];
}
