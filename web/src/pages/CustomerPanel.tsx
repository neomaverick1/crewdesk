import { Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, Drawer, ErrorNote, InvoiceBadge, JobBadge, Spinner } from '../components/ui.tsx';
import { day, dayShort, money } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useCustomer } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { CustomerForm } from './Customers.tsx';
import { JobForm } from './JobForm.tsx';

export function CustomerPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { org } = useAuthed();
  const panels = usePanels();
  const { data: c, isLoading, error } = useCustomer(id);
  const [editing, setEditing] = useState(false);
  const [newJob, setNewJob] = useState(false);

  return (
    <Drawer
      title={c?.name ?? 'Customer'}
      subtitle={c ? `Customer since ${day(c.createdAt, org.timezone)}` : null}
      onClose={onClose}
      actions={
        c ? (
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        ) : null
      }
    >
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5">
          <ErrorNote error={error} />
        </div>
      ) : c ? (
        <div className="divide-y divide-slate-100">
          <div className="space-y-2 px-5 py-4 text-sm">
            <p className="flex items-center gap-2 text-slate-700">
              <MapPin className="size-4 text-slate-400" /> {c.address}, {c.city}
            </p>
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-orange-600">
                <Phone className="size-4 text-slate-400" /> {c.phone}
              </a>
            ) : null}
            {c.email ? (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-slate-700 hover:text-orange-600">
                <Mail className="size-4 text-slate-400" /> {c.email}
              </a>
            ) : null}
            {c.notes ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 ring-1 ring-inset ring-amber-200">{c.notes}</p> : null}
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
            <div className="px-3 py-4">
              <div className="tabular text-xl font-semibold">{c.jobs}</div>
              <div className="text-xs text-slate-500">jobs</div>
            </div>
            <div className="px-3 py-4">
              <div className="tabular text-xl font-semibold">{c.openJobs}</div>
              <div className="text-xs text-slate-500">open</div>
            </div>
            <div className="px-3 py-4">
              <div className="tabular text-xl font-semibold">{money(c.balanceCents)}</div>
              <div className="text-xs text-slate-500">to be paid</div>
            </div>
          </div>
          <section className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Jobs</h3>
              <Button size="sm" variant="ghost" onClick={() => setNewJob(true)}>
                <Plus className="size-3.5" /> New job
              </Button>
            </div>
            <ul className="divide-y divide-slate-100">
              {c.recentJobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => panels.open('job', j.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{j.title}</div>
                      <div className="text-xs text-slate-500">
                        {j.number} · {j.scheduledAt ? dayShort(j.scheduledAt, org.timezone) : 'not scheduled'}
                        {j.technician ? ` · ${j.technician.name}` : ''}
                      </div>
                    </div>
                    <JobBadge status={j.status} />
                  </button>
                </li>
              ))}
              {!c.recentJobs.length ? <li className="py-4 text-sm text-slate-500">No jobs yet.</li> : null}
            </ul>
          </section>
          <section className="px-5 py-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Invoices</h3>
            <ul className="divide-y divide-slate-100">
              {c.invoices.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => panels.open('invoice', i.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{i.number}</div>
                      <div className="text-xs text-slate-500">
                        {i.issuedAt ? `Issued ${day(i.issuedAt, org.timezone)}` : 'Not sent yet'}
                      </div>
                    </div>
                    <span className="tabular text-sm font-medium">{money(i.totalCents)}</span>
                    <InvoiceBadge status={i.status} />
                  </button>
                </li>
              ))}
              {!c.invoices.length ? <li className="py-4 text-sm text-slate-500">No invoices yet.</li> : null}
            </ul>
          </section>
        </div>
      ) : null}
      {editing && c ? <CustomerForm customer={c} onClose={() => setEditing(false)} /> : null}
      {newJob && c ? <JobForm customerId={c.id} onClose={() => setNewJob(false)} /> : null}
    </Drawer>
  );
}
