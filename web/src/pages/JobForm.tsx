import { useState, type FormEvent } from 'react';

import type { JobDetail } from '../../../server/types.ts';
import { fromLocalInput, toLocalInput } from '../../../server/time.ts';
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from '../components/ui.tsx';
import { RequestError } from '../lib/api.ts';
import { duration } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useCustomers, useSaveJob, useTeam } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360];

/** Create a job, or edit one (title, customer, technician, time, estimate). */
export function JobForm({ job, customerId, note, onClose }: { job?: JobDetail; customerId?: number; note?: string; onClose: () => void }) {
  const { org } = useAuthed();
  const panels = usePanels();
  const customers = useCustomers({ search: '', page: 1, pageSize: 100 });
  const team = useTeam();
  const save = useSaveJob();
  const [form, setForm] = useState({
    customerId: String(job?.customer.id ?? customerId ?? ''),
    title: job?.title ?? '',
    description: job?.description ?? '',
    priority: job?.priority ?? 'normal',
    estimate: job ? String(job.estimateCents / 100) : '',
    technicianId: String(job?.technician?.id ?? ''),
    when: job?.scheduledAt ? toLocalInput(job.scheduledAt, org.timezone) : '',
    durationMinutes: String(job?.durationMinutes ?? 60),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = save.error instanceof RequestError ? save.error.fields : {};

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const estimate = Number(form.estimate || 0);
    save.mutate(
      {
        id: job?.id,
        ...(job ? {} : { customerId: Number(form.customerId) || 0 }),
        title: form.title,
        description: form.description,
        priority: form.priority,
        estimateCents: Number.isFinite(estimate) ? Math.round(estimate * 100) : -1,
        technicianId: form.technicianId ? Number(form.technicianId) : null,
        scheduledAt: form.when ? fromLocalInput(form.when, org.timezone).toISOString() : null,
        durationMinutes: Number(form.durationMinutes),
      },
      {
        onSuccess: (saved) => {
          toast(job ? `${saved.number} saved` : `${saved.number} created`);
          onClose();
          if (!job) panels.open('job', saved.id);
        },
      },
    );
  };

  const techs = (team.data ?? []).filter((m) => m.role === 'technician' && m.active);

  return (
    <Modal
      title={job ? `Edit ${job.number}` : 'New job'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="job-form" busy={save.isPending}>
            {job ? 'Save changes' : 'Create job'}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {note ? (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 ring-1 ring-inset ring-sky-200 sm:col-span-2">{note}</p>
        ) : null}
        {!job ? (
          <Field label="Customer" error={err.customerId} className="sm:col-span-2">
            {(id) => (
              <Select id={id} value={form.customerId} onChange={set('customerId')} invalid={!!err.customerId}>
                <option value="">Choose a customer…</option>
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.city}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="What needs doing" error={err.title} className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Replace kitchen faucet"
              invalid={!!err.title}
              autoFocus={!job}
            />
          )}
        </Field>
        <Field label="Notes for the technician" className="sm:col-span-2">
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={form.description}
              onChange={set('description')}
              placeholder="Access, parts to bring, what the customer said…"
            />
          )}
        </Field>
        <Field label="Technician" error={err.technicianId}>
          {(id) => (
            <Select id={id} value={form.technicianId} onChange={set('technicianId')} invalid={!!err.technicianId}>
              <option value="">Not assigned yet</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {(t.minutesThisWeek / 60).toFixed(1)} h this week
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Date and time" error={err.scheduledAt} hint={`${org.timezone.replace('_', ' ')} time`}>
          {(id) => <Input id={id} type="datetime-local" value={form.when} onChange={set('when')} invalid={!!err.scheduledAt} step={900} />}
        </Field>
        <Field label="Expected length" error={err.durationMinutes}>
          {(id) => (
            <Select id={id} value={form.durationMinutes} onChange={set('durationMinutes')}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {duration(m)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Estimate" error={err.estimateCents}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={form.estimate}
              onChange={set('estimate')}
              placeholder="0.00"
              invalid={!!err.estimateCents}
            />
          )}
        </Field>
        <Field label="Priority">
          {(id) => (
            <Select id={id} value={form.priority} onChange={set('priority')}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </Select>
          )}
        </Field>
        {save.error && !Object.keys(err).length ? (
          <div className="sm:col-span-2">
            <ErrorNote error={save.error} />
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
