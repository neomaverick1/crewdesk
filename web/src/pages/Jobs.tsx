import { AlertTriangle, BriefcaseBusiness, Plus, Search } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import type { JobStatus, JobSummary } from '../../../server/types.ts';
import { PageHeader } from '../components/Layout.tsx';
import { Avatar, Button, Input, Select } from '../components/ui.tsx';
import { cx } from '../lib/cx.ts';
import { dateTime, JOB_STATUS, moneyShort } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useJob, useJobs, useSaveJob, useTeam } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';
import { JobForm } from './JobForm.tsx';

const COLUMNS: { status: JobStatus; hint: string }[] = [
  { status: 'new', hint: 'Waiting for a technician and a time' },
  { status: 'scheduled', hint: 'Booked' },
  { status: 'in_progress', hint: 'On site now' },
  { status: 'done', hint: 'Finished in the last 7 days' },
];

function JobCard({ job, tz, draggable }: { job: JobSummary; tz: string; draggable: boolean }) {
  const panels = usePanels();
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/job', String(job.id));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => panels.open('job', job.id)}
      className={cx(
        'block w-full rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-orange-300',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-medium">{job.number}</span>
        {job.priority === 'urgent' ? (
          <span className="flex items-center gap-1 font-semibold text-rose-600">
            <AlertTriangle className="size-3.5" /> Urgent
          </span>
        ) : (
          <span className="tabular">{moneyShort(job.estimateCents)}</span>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{job.title}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">
        {job.customer.name} · {job.customer.city}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-slate-600">{job.scheduledAt ? dateTime(job.scheduledAt, tz) : 'No time yet'}</span>
        {job.technician ? (
          <Avatar person={job.technician} size="sm" />
        ) : (
          <span className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-400">Unassigned</span>
        )}
      </div>
    </button>
  );
}

export function Jobs() {
  const { org, can, user } = useAuthed();
  const office = can('owner', 'dispatcher');
  const [search, setSearch] = useState('');
  const [tech, setTech] = useState('');
  const [over, setOver] = useState<JobStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [scheduling, setScheduling] = useState<number | null>(null);
  const team = useTeam(office);
  const filters = { search: search.trim(), technicianId: tech ? Number(tech) : undefined };
  const [weekAgo] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString());
  const open = useJobs({ ...filters, status: 'new,scheduled,in_progress' });
  const done = useJobs({ ...filters, status: 'done', from: weekAgo });
  const save = useSaveJob();
  const pending = useJob(scheduling);

  const byStatus = (s: JobStatus) => (s === 'done' ? (done.data ?? []).slice().reverse() : (open.data ?? []).filter((j) => j.status === s));

  const drop = (status: JobStatus) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('text/job'));
    const job = [...(open.data ?? []), ...(done.data ?? [])].find((j) => j.id === id);
    if (!job || job.status === status) return;
    if (status === 'new' && !office) return;
    if (status === 'scheduled' && (!job.technician || !job.scheduledAt)) {
      setScheduling(job.id); // needs a technician and a time first
      return;
    }
    save.mutate(
      { id, status },
      {
        onSuccess: () => toast(`${job.number} moved to ${JOB_STATUS[status].label.toLowerCase()}`),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={
          office
            ? 'Drag a card to change its status, or open it for details.'
            : `Your jobs, ${user.name.split(' ')[0]}. Drag a card when you start or finish.`
        }
        actions={
          office ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New job
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs, customers, addresses"
            className="pl-9"
            aria-label="Search jobs"
          />
        </div>
        {office ? (
          <Select value={tech} onChange={(e) => setTech(e.target.value)} className="w-full sm:w-56" aria-label="Technician">
            <option value="">Every technician</option>
            {(team.data ?? [])
              .filter((m) => m.role === 'technician')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </Select>
        ) : null}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[880px] grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const jobs = byStatus(col.status);
            return (
              <section
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(col.status);
                }}
                onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
                onDrop={drop(col.status)}
                className={cx(
                  'flex min-h-[60vh] flex-col rounded-xl bg-slate-100/80 p-3 ring-2 ring-transparent transition',
                  over === col.status && 'bg-orange-50 ring-orange-300',
                )}
              >
                <header className="mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={cx('size-2 rounded-full', JOB_STATUS[col.status].dot)} />
                    <h2 className="text-sm font-semibold text-slate-800">{JOB_STATUS[col.status].label}</h2>
                    <span className="tabular rounded-full bg-white px-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                      {jobs.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{col.hint}</p>
                </header>
                <div className="flex flex-1 flex-col gap-2.5">
                  {jobs.map((j) => (
                    <JobCard key={j.id} job={j} tz={org.timezone} draggable={office || j.status !== 'new'} />
                  ))}
                  {!jobs.length && !(open.isLoading || done.isLoading) ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                      <BriefcaseBusiness className="mb-1.5 size-5" />
                      Nothing here
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {creating ? <JobForm onClose={() => setCreating(false)} /> : null}
      {scheduling && pending.data ? (
        <JobForm job={pending.data} note="Pick a technician and a time to schedule this job." onClose={() => setScheduling(null)} />
      ) : null}
    </>
  );
}
