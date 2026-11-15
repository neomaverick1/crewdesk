import type { ApiError, Session } from '../../../server/types.ts';

/** True in the GitHub Pages build, where the API runs inside the browser instead of on a server. */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export class RequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, body: ApiError | null) {
    super(body?.error.message ?? 'Something went wrong. Try again.');
    this.status = status;
    this.code = body?.error.code ?? 'network';
    this.fields = body?.error.fields ?? {};
  }
}

type Fetcher = (req: Request) => Promise<Response> | Response;
let demoFetch: Promise<Fetcher> | null = null;

/** Starts the in-browser API once (demo build only). */
export function startDemo(onStep?: (step: string) => void): Promise<Fetcher> {
  // The literal check lets the normal build leave the demo (and its database) out entirely.
  if (!demoFetch)
    demoFetch =
      import.meta.env.VITE_DEMO === '1'
        ? import('./demo.ts').then((m) => m.startDemo(onStep))
        : Promise.reject(new Error('Not a demo build'));
  return demoFetch;
}

const SESSION_KEY = 'crewdesk.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode: the session lasts until the tab closes
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

/** Calls the REST API. Throws RequestError with the server's message and field errors. */
export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = loadSession()?.token;
  const req = new Request(new URL(`api${path}`, DEMO ? 'https://crewdesk.demo/' : document.baseURI.replace(/#.*$/, '')), {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let res: Response;
  try {
    res = DEMO ? await (await startDemo())(req) : await fetch(req);
  } catch {
    throw new RequestError(0, { error: { code: 'network', message: 'Can’t reach the server. Check your connection.' } });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new RequestError(res.status, data);
  }
  return data as T;
}
