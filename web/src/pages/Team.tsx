import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { ROLES, type Role, type TeamMember } from '../../../server/types.ts';
import { PageHeader } from '../components/Layout.tsx';
import { Avatar, Button, Card, ErrorNote, Field, Input, Modal, RoleBadge, Select, Spinner } from '../components/ui.tsx';
import { RequestError } from '../lib/api.ts';
import { ROLE } from '../lib/format.ts';
import { useSaveMember, useTeam } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';

function AddMember({ onClose }: { onClose: () => void }) {
  const save = useSaveMember();
  const [form, setForm] = useState({ name: '', email: '', role: 'technician' as Role, password: '' });
  const err = save.error instanceof RequestError ? save.error.fields : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form, { onSuccess: (m) => (toast(`${m.name} can now sign in`), onClose()) });
  };
  return (
    <Modal
      title="Add a team member"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="member-form" busy={save.isPending}>
            Add to team
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="space-y-4">
        <Field label="Name" error={err.name}>
          {(id) => (
            <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!err.name} autoFocus />
          )}
        </Field>
        <Field label="Email" error={err.email}>
          {(id) => (
            <Input
              id={id}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              invalid={!!err.email}
            />
          )}
        </Field>
        <Field label="Role" hint={ROLE[form.role].about}>
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE[r].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Temporary password" error={err.password} hint="At least 8 characters. They can use it to sign in right away.">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              invalid={!!err.password}
            />
          )}
        </Field>
        {save.error && !Object.keys(err).length ? <ErrorNote error={save.error} /> : null}
      </form>
    </Modal>
  );
}

function MemberRow({ m, manage, self }: { m: TeamMember; manage: boolean; self: boolean }) {
  const save = useSaveMember();
  const change = (input: { role?: Role; active?: boolean }, message: string) =>
    save.mutate({ id: m.id, ...input }, { onSuccess: () => toast(message), onError: (e) => toast(e.message, 'error') });
  return (
    <tr className={m.active ? '' : 'opacity-50'}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar person={m} />
          <div>
            <div className="font-medium text-slate-900">
              {m.name} {self ? <span className="text-xs font-normal text-slate-500">(you)</span> : null}
            </div>
            <div className="text-xs text-slate-500">{m.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        {manage && !self ? (
          <Select
            value={m.role}
            onChange={(e) =>
              change({ role: e.target.value as Role }, `${m.name} is now ${ROLE[e.target.value as Role].label.toLowerCase()}`)
            }
            className="w-36"
            aria-label={`Role for ${m.name}`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE[r].label}
              </option>
            ))}
          </Select>
        ) : (
          <RoleBadge role={m.role} />
        )}
      </td>
      <td className="tabular px-5 py-3 text-right">{m.role === 'technician' ? m.jobsThisWeek : '—'}</td>
      <td className="tabular px-5 py-3 text-right">{m.role === 'technician' ? `${(m.minutesThisWeek / 60).toFixed(1)} h` : '—'}</td>
      <td className="tabular px-5 py-3 text-right">{m.role === 'technician' ? m.completedThisMonth : '—'}</td>
      <td className="px-5 py-3 text-right">
        {manage && !self ? (
          <Button
            size="sm"
            variant={m.active ? 'ghost' : 'secondary'}
            busy={save.isPending}
            onClick={() => change({ active: !m.active }, m.active ? `${m.name} can no longer sign in` : `${m.name} reactivated`)}
          >
            {m.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        ) : (
          <span className="text-xs text-slate-400">{m.active ? 'Active' : 'Inactive'}</span>
        )}
      </td>
    </tr>
  );
}

export function Team() {
  const { user, can } = useAuthed();
  const manage = can('owner');
  const { data, isLoading } = useTeam();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Team"
        subtitle={manage ? 'Add people, set their role, or turn off access.' : 'Only the owner can change the team.'}
        actions={
          manage ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add member
            </Button>
          ) : null
        }
      />
      <Card pad={false}>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Person</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3 text-right">Jobs this week</th>
                  <th className="px-5 py-3 text-right">Booked</th>
                  <th className="px-5 py-3 text-right">Done this month</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((m) => (
                  <MemberRow key={m.id} m={m} manage={manage} self={m.id === user.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
            <RoleBadge role={r} />
            <p className="mt-2 text-slate-600">{ROLE[r].about}.</p>
          </div>
        ))}
      </div>
      {adding ? <AddMember onClose={() => setAdding(false)} /> : null}
    </>
  );
}
