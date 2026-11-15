import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../../../server/app.ts';
import { migrate, pgliteDb } from '../../../server/db.ts';
import { seed } from '../../../server/seed.ts';

// The live demo has no server: the real API (server/app.ts) runs here, on PGlite, which is PostgreSQL compiled to
// WebAssembly and saved in IndexedDB. The data is rebuilt each day so "today" always has work in it.

const DB_NAME = 'crewdesk-demo';
const SEEDED_KEY = 'crewdesk.demo.seeded';
const SECRET_KEY = 'crewdesk.demo.secret';

const today = () => new Date().toISOString().slice(0, 10);

function secret(): string {
  try {
    let s = localStorage.getItem(SECRET_KEY);
    if (!s) {
      s = crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem(SECRET_KEY, s);
    }
    return s;
  } catch {
    return crypto.randomUUID() + crypto.randomUUID();
  }
}

async function open(): Promise<PGlite> {
  try {
    return await PGlite.create(`idb://${DB_NAME}`);
  } catch {
    return PGlite.create(); // IndexedDB unavailable (private mode): keep it in memory
  }
}

export async function startDemo(onStep?: (step: string) => void) {
  let stale = false;
  try {
    stale = localStorage.getItem(SEEDED_KEY) !== today();
  } catch {
    stale = true;
  }
  if (stale) await wipe();

  onStep?.('Starting PostgreSQL in your browser');
  const pg = await open();
  const db = pgliteDb(pg);
  if (await migrate(db)) {
    onStep?.('Loading six months of demo data');
    await seed(db);
  }
  try {
    localStorage.setItem(SEEDED_KEY, today());
  } catch {
    // fine
  }
  const app = createApp({ db, secret: secret(), onError: (err) => console.error(err) });
  return (req: Request) => app.fetch(req);
}

/** Deletes the demo database, so the next start seeds a fresh copy. */
export function wipe(): Promise<void> {
  return new Promise((resolve) => {
    try {
      localStorage.removeItem(SEEDED_KEY);
      const req = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
