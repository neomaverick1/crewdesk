import { CalendarClock, CheckCircle2, FileText, Mail, MapPin, Pencil, Phone, Play, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { JobDetail, JobStatus } from '../../../server/types.ts';
import { Avatar, Button, Drawer, ErrorNote, InvoiceBadge, JobBadge, Spinner, Textarea } from '../components/ui.tsx';
import { dateTime, duration, money, PRIORITY } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useDeleteJob, useInvoiceActions, useJob, useSaveJob } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';
import { ActivityFeed } from './Dashboard.tsx';
import { JobForm } from './JobForm.tsx';

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="mt-0.5 text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-0.5 text-sm text-slate-900">{children}</div>
      </div>
    </div>
  );
}

export function JobPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: job, isLoading, error } = useJob(id);
  return (
    <Drawer title={job ? `${job.number} · ${job.title}` : 'Job'} subtitle={job ? <JobBadge status={job.status} /> : null} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5">
          <ErrorNote error={error} />
        </div>
      ) : job ? (
        <JobBody job={job} onClose={onClose} />
      ) : null}
    </Drawer>
  );
}

function JobBody({ job, onClose }: { job: JobDetail; onClose: () => void }) {
  const { org, can } = useAuthed();
  const office = can('owner', 'dispatcher');
  const panels = usePanels();
  const save = useSaveJob();
  const remove = useDeleteJob();
  const invoices = useInvoiceActions();
  const [editing, setEditing] = useState<string | null>(null);
  const [notes, setNotes] = useState(job.description);

  const move = (status: JobStatus, message: string) =>
    save.mutate(
      { id: job.id, status },
      {
        onSuccess: () => toast(message),
        onError: (e) => (e.message.startsWith('Pick a technician') ? setEditing(e.message) : toast(e.message, 'error')),
      },
    );
  const invoice = () =>
    invoices.create.mutate(
      { jobId: job.id },
      {
        onSuccess: (inv) => (toast(`Draft ${inv.number} created`), panels.open('invoice', inv.id)),
        onError: (e) => toast(e.message, 'error'),
      },
    );
  const del = () => {
    if (!window.confirm(`Delete ${job.number}? This can’t be undone.`)) return;
    remove.mutate(job.id, { onSuccess: () => (toast(`${job.number} deleted`), onClose()), onError: (e) => toast(e.message, 'error') });
  };

  return (
    <div className="divide-y divide-slate-100">
      <div className="flex flex-wrap gap-2 px-5 py-4">
        {job.status === 'new' && office ? (
          <Button variant="primary" onClick={() => setEditing('Pick a technician and a time to schedule this job.')}>
            <CalendarClock className="size-4" /> Schedule
          </Button>
        ) : null}
        {job.status === 'scheduled' ? (
          <Button variant="primary" busy={save.isPending} onClick={() => move('in_progress', `${job.number} started`)}>
            <Play className="size-4" /> Start job
          </Button>
        ) : null}
        {job.status === 'in_progress' ? (
          <Button variant="primary" busy={save.isPending} onClick={() => move('done', `${job.number} marked done`)}>
            <CheckCircle2 className="size-4" /> Mark done
          </Button>
        ) : null}
        {job.status === 'done' && office && !job.invoice ? (
          <Button variant="primary" busy={invoices.create.isPending} onClick={invoice}>
            <FileText className="size-4" /> Create invoice
          </Button>
        ) : null}
        {job.invoice && office ? (
          <Button onClick={() => panels.open('invoice', job.invoice!.id)}>
            <FileText className="size-4" /> {job.invoice.number} <InvoiceBadge status={job.invoice.status} />
          </Button>
        ) : null}
        {office && job.status !== 'done' && job.status !== 'cancelled' ? (
          <Button onClick={() => setEditing('')}>
            <Pencil className="size-4" /> Edit
          </Button>
        ) : null}
        {office && (job.status === 'done' || job.status === 'cancelled') && job.invoice?.status !== 'paid' ? (
          <Button onClick={() => move(job.technician && job.scheduledAt ? 'scheduled' : 'new', `${job.number} reopened`)}>
            <RotateCcw className="size-4" /> Reopen
          </Button>
        ) : null}
        {office && job.status !== 'done' && job.status !== 'cancelled' ? (
          <Button variant="ghost" onClick={() => move('cancelled', `${job.number} cancelled`)}>
            <XCircle className="size-4" /> Cancel job
          </Button>
        ) : null}
        {office && !job.invoice ? (
          <Button variant="ghost" onClick={del} className="ml-auto text-rose-600 hover:text-rose-700" aria-label="Delete job">
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-x-6 px-5 sm:grid-cols-2">
        <Row icon={<CalendarClock className="size-4" />} label="When">
          {job.scheduledAt ? dateTime(job.scheduledAt, org.timezone) : <span className="text-slate-500">Not scheduled</span>}
          <span className="text-slate-500"> · {duration(job.durationMinutes)}</span>
        </Row>
        <Row icon={<span className="block size-4 rounded-full border-2 border-current" />} label="Technician">
          {job.technician ? (
            <span className="flex items-center gap-2">
              <Avatar person={job.technician} size="sm" /> {job.technician.name}
            </span>
          ) : (
            <span className="text-slate-500">Not assigned</span>
          )}
        </Row>
        <Row icon={<MapPin className="size-4" />} label="Customer">
          {office ? (
            <button
              type="button"
              className="font-medium hover:text-orange-600 hover:underline"
              onClick={() => panels.open('customer', job.customer.id)}
            >
              {job.customer.name}
            </button>
          ) : (
            <span className="font-medium">{job.customer.name}</span>
          )}
          <div className="text-slate-600">
            {job.customer.address}, {job.customer.city}
          </div>
          {job.customer.notes ? <div className="mt-1 text-xs text-amber-700">{job.customer.notes}</div> : null}
        </Row>
        <Row icon={<Phone className="size-4" />} label="Contact">
          {job.customer.phone ? (
            <a href={`tel:${job.customer.phone}`} className="hover:text-orange-600">
              {job.customer.phone}
            </a>
          ) : (
            '—'
          )}
          {job.customer.email ? (
            <a href={`mailto:${job.customer.email}`} className="flex items-center gap-1 text-slate-600 hover:text-orange-600">
              <Mail className="size-3.5" /> {job.customer.email}
            </a>
          ) : null}
        </Row>
        <Row icon={<span className="text-xs font-bold">$</span>} label="Estimate">
          {money(job.estimateCents)}
        </Row>
        <Row icon={<span className="text-xs font-bold">!</span>} label="Priority">
          <span className={PRIORITY[job.priority].className}>{PRIORITY[job.priority].label}</span>
        </Row>
      </div>

      <div className="px-5 py-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Notes</div>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about the visit…" />
        {notes !== job.description ? (
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" onClick={() => setNotes(job.description)}>
              Discard
            </Button>
            <Button
              size="sm"
              variant="primary"
              busy={save.isPending}
              onClick={() => save.mutate({ id: job.id, description: notes }, { onSuccess: () => toast('Notes saved') })}
            >
              Save notes
            </Button>
          </div>
        ) : null}
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">History</div>
        <ActivityFeed items={job.activity} />
      </div>

      {editing !== null ? <JobForm job={job} note={editing || undefined} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
