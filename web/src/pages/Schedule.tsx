import { AlertTriangle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import type { JobSummary, Person } from '../../../server/types.ts';
import { localDate, toLocalInput, zoned } from '../../../server/time.ts';
import { PageHeader } from '../components/Layout.tsx';
import { Avatar, Button } from '../components/ui.tsx';
import { cx } from '../lib/cx.ts';
import { dayKey, JOB_STATUS, time } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useJobs, useSaveJob, useTeam } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Chip({ job, tz, draggable }: { job: JobSummary; tz: string; draggable: boolean }) {
  const panels = usePanels();
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/job', String(job.id))}
      onClick={() => panels.open('job', job.id)}
      className={cx(
        'block w-full rounded-md border-l-[3px] bg-white px-2 py-1.5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-orange-300',
        job.status === 'cancelled' && 'opacity-50 line-through',
        draggable && 'cursor-grab',
      )}
      style={{ borderLeftColor: job.technician?.color ?? '#94a3b8' }}
      title={`${job.number} · ${job.title} · ${job.customer.name}`}
    >
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-500">
        <span className={cx('size-1.5 shrink-0 rounded-full', JOB_STATUS[job.status].dot)} />
        <span className="tabular">{job.scheduledAt ? time(job.scheduledAt, tz) : job.number}</span>
        {job.priority === 'urgent' ? <AlertTriangle className="ml-auto size-3 shrink-0 text-rose-600" aria-label="Urgent" /> : null}
      </div>
      <div className="truncate text-xs font-semibold text-slate-800">{job.title}</div>
      <div className="truncate text-[11px] text-slate-500">{job.customer.name}</div>
    </button>
  );
}

export function Schedule() {
  const { org, can, user } = useAuthed();
  const tz = org.timezone;
  const office = can('owner', 'dispatcher');
  const [offset, setOffset] = useState(0); // weeks from this one
  const [over, setOver] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  const t = localDate(tz, now);
  const weekday = new Date(Date.UTC(t.y, t.m, t.d)).getUTCDay();
  const monday = t.d - ((weekday + 6) % 7) + offset * 7;
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(t.y, t.m, monday + i)));
  const from = zoned(tz, t.y, t.m, monday).toISOString();
  const to = zoned(tz, t.y, t.m, monday + 7).toISOString();
  const todayKey = dayKey(now, tz);

  const team = useTeam(office);
  const week = useJobs({ from, to });
  const unscheduled = useJobs({ status: 'new' });
  const save = useSaveJob();

  const people: Person[] = office ? (team.data ?? []).filter((m) => m.role === 'technician' && m.active) : [user];
  const jobs = (week.data ?? []).filter((j) => j.scheduledAt);
  const cell = (techId: number, key: string) => jobs.filter((j) => j.technician?.id === techId && dayKey(j.scheduledAt!, tz) === key);
  const keyOf = (d: Date) => d.toISOString().slice(0, 10);

  const drop = (techId: number, d: Date) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('text/job'));
    const job = [...jobs, ...(unscheduled.data ?? [])].find((j) => j.id === id);
    if (!job) return;
    // Keep the job's time of day; new requests land at 9:00.
    const [hh, mm] = job.scheduledAt ? toLocalInput(job.scheduledAt, tz).slice(11).split(':').map(Number) : [9, 0];
    const at = zoned(tz, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm);
    const tech = people.find((p) => p.id === techId)!;
    save.mutate(
      { id, technicianId: techId, scheduledAt: at.toISOString() },
      {
        onSuccess: () => toast(`${job.number} booked with ${tech.name.split(' ')[0]}, ${WEEKDAY.format(d)} ${time(at.toISOString(), tz)}`),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  const label = `${MONTH_DAY.format(days[0])} – ${MONTH_DAY.format(days[6])}, ${days[6].getUTCFullYear()}`;
  const minutes = (techId: number) =>
    jobs.filter((j) => j.technician?.id === techId && j.status !== 'cancelled').reduce((s, j) => s + j.durationMinutes, 0);

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={office ? 'Drag jobs between days and technicians, or drop a new request onto someone’s day.' : 'Your week.'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular min-w-44 text-center text-sm font-semibold">{label}</span>
            <Button variant="ghost" onClick={() => setOffset((o) => o + 1)} aria-label="Next week">
              <ChevronRight className="size-4" />
            </Button>
            <Button onClick={() => setOffset(0)} disabled={offset === 0}>
              This week
            </Button>
          </div>
        }
      />

      {office ? (
        <section className="mb-5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4 text-slate-400" /> Needs scheduling
            <span className="tabular rounded-full bg-slate-100 px-2 text-xs text-slate-600">{unscheduled.data?.length ?? 0}</span>
            <span className="font-normal text-slate-500">· drag a request onto a technician’s day</span>
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {(unscheduled.data ?? []).map((j) => (
              <Chip key={j.id} job={j} tz={tz} draggable />
            ))}
          </div>
          {unscheduled.data?.length === 0 ? <p className="py-2 text-xs text-slate-400">All caught up.</p> : null}
        </section>
      ) : null}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="grid min-w-[1000px]" style={{ gridTemplateColumns: '160px repeat(7, minmax(0, 1fr))' }}>
          <div className="border-b border-slate-200 bg-slate-50" />
          {days.map((d) => (
            <div
              key={keyOf(d)}
              className={cx(
                'border-b border-l border-slate-200 bg-slate-50 px-2 py-2.5 text-center',
                keyOf(d) === todayKey && 'bg-orange-50',
              )}
            >
              <div className={cx('text-xs font-medium uppercase', keyOf(d) === todayKey ? 'text-orange-600' : 'text-slate-500')}>
                {WEEKDAY.format(d)}
              </div>
              <div className={cx('text-sm font-semibold', keyOf(d) === todayKey ? 'text-orange-600' : 'text-slate-800')}>
                {d.getUTCDate()}
              </div>
            </div>
          ))}
          {people.map((p) => (
            <div key={p.id} className="contents">
              <div className="flex items-start gap-2.5 border-b border-slate-100 px-3 py-3">
                <Avatar person={p} size="sm" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="tabular text-xs text-slate-500">{(minutes(p.id) / 60).toFixed(1)} h booked</div>
                </div>
              </div>
              {days.map((d) => {
                const key = `${p.id}-${keyOf(d)}`;
                return (
                  <div
                    key={key}
                    onDragOver={office ? (e) => (e.preventDefault(), setOver(key)) : undefined}
                    onDragLeave={() => setOver((o) => (o === key ? null : o))}
                    onDrop={office ? drop(p.id, d) : undefined}
                    className={cx(
                      'min-h-28 space-y-1.5 border-b border-l border-slate-100 p-1.5 transition-colors',
                      keyOf(d) === todayKey && 'bg-orange-50/40',
                      over === key && 'bg-orange-100/70',
                    )}
                  >
                    {cell(p.id, keyOf(d)).map((j) => (
                      <Chip key={j.id} job={j} tz={tz} draggable={office && j.status !== 'done'} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
