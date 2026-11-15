import { BriefcaseBusiness, CalendarDays, FileText, LayoutDashboard, LogOut, Menu, RotateCcw, Users, UsersRound, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';

import type { Role } from '../../../server/types.ts';
import { DEMO } from '../lib/api.ts';
import { cx } from '../lib/cx.ts';
import { ROLE } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useAuthed } from '../lib/session.ts';
import { CustomerPanel } from '../pages/CustomerPanel.tsx';
import { InvoicePanel } from '../pages/InvoicePanel.tsx';
import { JobPanel } from '../pages/JobPanel.tsx';
import { Avatar } from './ui.tsx';

const NAV: { to: string; label: string; icon: ReactNode; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="size-[18px]" />, roles: ['owner', 'dispatcher', 'technician'] },
  { to: '/jobs', label: 'Jobs', icon: <BriefcaseBusiness className="size-[18px]" />, roles: ['owner', 'dispatcher', 'technician'] },
  { to: '/schedule', label: 'Schedule', icon: <CalendarDays className="size-[18px]" />, roles: ['owner', 'dispatcher', 'technician'] },
  { to: '/customers', label: 'Customers', icon: <UsersRound className="size-[18px]" />, roles: ['owner', 'dispatcher'] },
  { to: '/invoices', label: 'Invoices', icon: <FileText className="size-[18px]" />, roles: ['owner', 'dispatcher'] },
  { to: '/team', label: 'Team', icon: <Users className="size-[18px]" />, roles: ['owner', 'dispatcher'] },
];

async function resetDemo() {
  if (import.meta.env.VITE_DEMO !== '1') return;
  const { wipe } = await import('../lib/demo.ts');
  await wipe();
  window.location.reload();
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, org, signOut } = useAuthed();
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <img src="./favicon.svg" alt="" className="size-8" />
        <div className="leading-tight">
          <div className="font-semibold text-white">Crewdesk</div>
          <div className="text-xs text-slate-400">{org.name}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white',
              )
            }
          >
            {n.icon}
            {n.label}
          </NavLink>
        ))}
      </nav>
      {DEMO ? (
        <div className="mx-3 mb-3 rounded-lg bg-slate-800/70 p-3 text-xs leading-relaxed text-slate-400">
          <p>
            <span className="font-semibold text-orange-300">Live demo.</span> The API and a PostgreSQL database run in your browser. Changes
            stay in this browser.
          </p>
          <button
            type="button"
            onClick={resetDemo}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-slate-200 hover:text-white"
          >
            <RotateCcw className="size-3.5" /> Reset demo data
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-3 border-t border-slate-800 px-4 py-4">
        <Avatar person={user} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="text-xs text-slate-400">{ROLE[user.role].label}</div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const panels = usePanels();
  const job = panels.id('job');
  const customer = panels.id('customer');
  const invoice = panels.id('invoice');

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 z-10 rounded-md p-1 text-slate-400 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <img src="./favicon.svg" alt="" className="size-7" />
        <span className="font-semibold">Crewdesk</span>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
      {job ? <JobPanel id={job} onClose={panels.close} /> : null}
      {customer ? <CustomerPanel id={customer} onClose={panels.close} /> : null}
      {invoice ? <InvoicePanel id={invoice} onClose={panels.close} /> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
