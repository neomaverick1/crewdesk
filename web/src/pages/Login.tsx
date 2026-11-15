import { ArrowRight, CalendarDays, FileText, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { DEMO_PASSWORD, DEMO_USERS } from '../../../server/seed.ts';
import { Avatar, Button, ErrorNote, Field, Input } from '../components/ui.tsx';
import { DEMO, RequestError } from '../lib/api.ts';
import { ROLE } from '../lib/format.ts';
import { useSession } from '../lib/session.ts';

const ACCOUNTS = DEMO_USERS.filter((u) =>
  ['dana@brightside.example', 'marcus@brightside.example', 'priya@brightside.example'].includes(u.email),
);

export function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<RequestError | null>(null);

  const go = async (e: string, p: string) => {
    setBusy(e);
    setError(null);
    try {
      await signIn(e, p);
    } catch (err) {
      setError(err instanceof RequestError ? err : new RequestError(0, null));
      setBusy(null);
    }
  };
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    go(email, password);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src="./favicon.svg" alt="" className="size-10" />
          <span className="text-xl font-semibold">Crewdesk</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Run every job, crew and invoice from one desk.</h1>
          <p className="mt-4 text-lg text-slate-300">
            Scheduling, dispatch and billing for service businesses, with a dashboard for the office and a simple day view for technicians.
          </p>
          <ul className="mt-8 space-y-4 text-slate-200">
            <li className="flex gap-3">
              <CalendarDays className="mt-0.5 size-5 shrink-0 text-orange-400" />
              Drag jobs onto the crew calendar and across the job board
            </li>
            <li className="flex gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-orange-400" />
              Turn finished jobs into invoices and track what is overdue
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-orange-400" />
              Owner, dispatcher and technician roles, enforced by the API
            </li>
          </ul>
        </div>
        <p className="relative text-sm text-slate-400">
          {DEMO
            ? 'This demo runs the real REST API and a PostgreSQL database (PGlite) inside your browser. Nothing is sent anywhere.'
            : 'React web app with a Node.js REST API and PostgreSQL.'}
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="./favicon.svg" alt="" className="size-9" />
            <span className="text-lg font-semibold">Crewdesk</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Brightside Home Services · demo company</p>

          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Try it as</p>
            {ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => go(a.email, DEMO_PASSWORD)}
                disabled={!!busy}
                className="group flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-300 disabled:opacity-60"
              >
                <Avatar person={a} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {a.name} <span className="font-normal text-slate-500">· {ROLE[a.role].label}</span>
                  </span>
                  <span className="block truncate text-xs text-slate-500">{ROLE[a.role].about}</span>
                </span>
                <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500" />
              </button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or with email
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" error={error?.fields.email}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  invalid={!!error?.fields.email}
                />
              )}
            </Field>
            <Field label="Password" error={error?.fields.password}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  invalid={!!error?.fields.password}
                />
              )}
            </Field>
            {error && !Object.keys(error.fields).length ? <ErrorNote error={error} /> : null}
            <Button type="submit" variant="primary" className="w-full" busy={busy === email}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
            <KeyRound className="size-3.5" /> Every demo account uses the password{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{DEMO_PASSWORD}</code>
          </p>
        </div>
      </section>
    </div>
  );
}
