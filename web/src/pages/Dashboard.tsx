import { ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CheckCircle2, Clock, MapPin, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { Activity, Dashboard as Data, JobStatus, JobSummary, Kpi } from '../../../server/types.ts';
import { PageHeader } from '../components/Layout.tsx';
import { Avatar, Button, Card, Empty, JobBadge, Spinner } from '../components/ui.tsx';
import { cx } from '../lib/cx.ts';
import { ago, duration, hourOf, JOB_STATUS, longDate, money, moneyCompact, moneyShort, time } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useDashboard, useSaveJob } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';
import { JobForm } from './JobForm.tsx';

function KpiCard({ kpi }: { kpi: Kpi }) {
  const value =
    kpi.kind === 'money'
      ? moneyShort(kpi.value)
      : kpi.kind === 'percent'
        ? `${Math.round(kpi.value)}%`
        : Number.isInteger(kpi.value)
          ? String(kpi.value)
          : kpi.value.toFixed(1);
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      <p
        className={cx(
          'mt-1.5 flex items-center gap-1 text-xs',
          kpi.tone === 'good' ? 'text-emerald-600' : kpi.tone === 'bad' ? 'text-rose-600' : 'text-slate-500',
        )}
      >
        {kpi.tone === 'good' ? <ArrowUpRight className="size-3.5" /> : kpi.tone === 'bad' ? <ArrowDownRight className="size-3.5" /> : null}
        {kpi.hint}
      </p>
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function RevenueChart({ data }: { data: NonNullable<Data['revenue']> }) {
  const rows = data.map((d) => ({ ...d, label: MONTH.format(new Date(`${d.month}-01T00:00:00Z`)) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={4} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => moneyCompact(v)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
            width={56}
          />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            formatter={(v, name) => [money(Number(v)), name === 'invoicedCents' ? 'Invoiced' : 'Paid']}
            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
          />
          <Bar dataKey="invoicedCents" fill="#fdba74" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="paidCents" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusList({ counts }: { counts: Record<JobStatus, number> }) {
  const open: JobStatus[] = ['new', 'scheduled', 'in_progress'];
  const max = Math.max(1, ...open.map((s) => counts[s]));
  return (
    <ul className="space-y-3.5">
      {open.map((s) => (
        <li key={s}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-slate-600">{JOB_STATUS[s].label}</span>
            <span className="tabular font-semibold">{counts[s]}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className={cx('h-2 rounded-full', JOB_STATUS[s].dot)} style={{ width: `${(counts[s] / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Workload({ rows }: { rows: Data['workload'] }) {
  const capacity = 40 * 60;
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const pct = Math.min(100, (r.minutes / capacity) * 100);
        return (
          <li key={r.id} className="flex items-center gap-3">
            <Avatar person={r} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex justify-between text-sm">
                <span className="truncate font-medium">{r.name}</span>
                <span className="tabular text-slate-500">
                  {(r.minutes / 60).toFixed(1)} h · {r.jobs} jobs
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className={cx('h-1.5 rounded-full', pct > 90 ? 'bg-rose-500' : 'bg-slate-700')} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityFeed({ items }: { items: Activity[] }) {
  const panels = usePanels();
  if (!items.length) return <p className="text-sm text-slate-500">Nothing yet.</p>;
  return (
    <ol className="space-y-4">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          {a.user ? <Avatar person={a.user} size="sm" /> : <span className="size-6" />}
          <div className="min-w-0">
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">{a.user?.name ?? 'System'}</span>{' '}
              {a.jobId ? (
                <button
                  type="button"
                  className="text-left hover:text-orange-600 hover:underline"
                  onClick={() => panels.open('job', a.jobId!)}
                >
                  {a.message}
                </button>
              ) : (
                a.message
              )}
            </p>
            <p className="text-xs text-slate-400">{ago(a.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TodayList({ jobs, tz, actions }: { jobs: JobSummary[]; tz: string; actions?: boolean }) {
  const panels = usePanels();
  const save = useSaveJob();
  const move = (j: JobSummary, status: JobStatus) =>
    save.mutate(
      { id: j.id, status },
      {
        onSuccess: () => toast(status === 'done' ? `${j.number} marked done` : `${j.number} started`),
        onError: (e) => toast(e.message, 'error'),
      },
    );
  if (!jobs.length)
    return (
      <Empty icon={<BriefcaseBusiness className="size-5" />} title="No jobs today">
        Enjoy the quiet, or check the schedule for the rest of the week.
      </Empty>
    );
  return (
    <ul className="divide-y divide-slate-100">
      {jobs.map((j) => (
        <li key={j.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/70">
          <div className="tabular w-16 shrink-0 text-sm font-semibold text-slate-900">{time(j.scheduledAt!, tz)}</div>
          <button type="button" onClick={() => panels.open('job', j.id)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-slate-900">
              {j.title} <span className="font-normal text-slate-400">· {j.number}</span>
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin className="size-3" /> {j.customer.name} · {j.customer.address}, {j.customer.city} · {duration(j.durationMinutes)}
            </p>
          </button>
          {j.technician && !actions ? <Avatar person={j.technician} size="sm" /> : null}
          {actions && j.status === 'scheduled' ? (
            <Button size="sm" onClick={() => move(j, 'in_progress')}>
              <Play className="size-3.5" /> Start
            </Button>
          ) : actions && j.status === 'in_progress' ? (
            <Button size="sm" variant="primary" onClick={() => move(j, 'done')}>
              <CheckCircle2 className="size-3.5" /> Done
            </Button>
          ) : (
            <JobBadge status={j.status} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const { user, org, can } = useAuthed();
  const { data, isLoading } = useDashboard();
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => new Date());
  const h = hourOf(now, org.timezone);
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const office = can('owner', 'dispatcher');

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        subtitle={`${longDate(now, org.timezone)} · ${office ? org.name : 'Your day at a glance'}`}
        actions={
          office ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New job
            </Button>
          ) : null
        }
      />
      {isLoading || !data ? (
        <Spinner label="Loading the dashboard…" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {data.kpis.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              {data.revenue ? (
                <Card
                  title="Revenue, last six months"
                  action={
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm bg-orange-300" /> Invoiced
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm bg-orange-500" /> Paid
                      </span>
                    </div>
                  }
                >
                  <RevenueChart data={data.revenue} />
                </Card>
              ) : null}
              <Card
                title={office ? 'Today across the crew' : 'Your jobs today'}
                action={
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="size-3.5" /> {org.timezone.replace('_', ' ')}
                  </span>
                }
                pad={false}
              >
                <TodayList jobs={data.today} tz={org.timezone} actions={!office} />
              </Card>
            </div>
            <div className="space-y-6">
              {office ? (
                <>
                  <Card title="Open jobs">
                    <StatusList counts={data.statusCounts} />
                  </Card>
                  <Card title="Crew this week" action={<span className="text-xs text-slate-500">of 40 h</span>}>
                    <Workload rows={data.workload} />
                  </Card>
                </>
              ) : null}
              <Card title="Recent activity">
                <ActivityFeed items={data.activity} />
              </Card>
            </div>
          </div>
        </div>
      )}
      {creating ? <JobForm onClose={() => setCreating(false)} /> : null}
    </>
  );
}
