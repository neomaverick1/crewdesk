import { ChevronLeft, ChevronRight, Plus, Search, UsersRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { CustomerDetail } from '../../../server/types.ts';
import { PageHeader } from '../components/Layout.tsx';
import { Button, Card, Empty, ErrorNote, Field, Input, Modal, Spinner, Textarea } from '../components/ui.tsx';
import { RequestError } from '../lib/api.ts';
import { day, money } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useCustomers, useSaveCustomer } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';

export function CustomerForm({ customer, onClose }: { customer?: CustomerDetail; onClose: () => void }) {
  const panels = usePanels();
  const save = useSaveCustomer();
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    city: customer?.city ?? 'Chicago',
    notes: customer?.notes ?? '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = save.error instanceof RequestError ? save.error.fields : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: customer?.id, ...form },
      {
        onSuccess: (c) => {
          toast(customer ? 'Customer saved' : `${c.name} added`);
          onClose();
          if (!customer) panels.open('customer', c.id);
        },
      },
    );
  };
  return (
    <Modal
      title={customer ? `Edit ${customer.name}` : 'New customer'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="customer-form" busy={save.isPending}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" error={err.name} className="sm:col-span-2">
          {(id) => <Input id={id} value={form.name} onChange={set('name')} invalid={!!err.name} autoFocus />}
        </Field>
        <Field label="Email" error={err.email}>
          {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} invalid={!!err.email} />}
        </Field>
        <Field label="Phone" error={err.phone}>
          {(id) => <Input id={id} type="tel" value={form.phone} onChange={set('phone')} invalid={!!err.phone} />}
        </Field>
        <Field label="Street address" error={err.address} className="sm:col-span-2">
          {(id) => <Input id={id} value={form.address} onChange={set('address')} invalid={!!err.address} />}
        </Field>
        <Field label="City" error={err.city}>
          {(id) => <Input id={id} value={form.city} onChange={set('city')} invalid={!!err.city} />}
        </Field>
        <Field label="Access notes" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={form.notes} onChange={set('notes')} placeholder="Gate codes, pets, parking…" />}
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

export function Customers() {
  const { org } = useAuthed();
  const panels = usePanels();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const pageSize = 15;
  const { data, isLoading, isFetching } = useCustomers({ search: search.trim(), page, pageSize });
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={data ? `${data.total} customers` : ' '}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New customer
          </Button>
        }
      />
      <Card pad={false}>
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, phone, address"
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
        </div>
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Empty icon={<UsersRound className="size-5" />} title="No customers found">
            Try another search.
          </Empty>
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Phone</th>
                    <th className="px-5 py-3">Address</th>
                    <th className="px-5 py-3 text-right">Jobs</th>
                    <th className="px-5 py-3 text-right">Balance</th>
                    <th className="px-5 py-3">Last visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((c) => (
                    <tr key={c.id} onClick={() => panels.open('customer', c.id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.email ?? '—'}</div>
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-slate-600">{c.phone ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {c.address}, {c.city}
                      </td>
                      <td className="tabular px-5 py-3 text-right">
                        {c.jobs}
                        {c.openJobs ? (
                          <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 text-xs text-sky-700">{c.openJobs} open</span>
                        ) : null}
                      </td>
                      <td
                        className={`tabular whitespace-nowrap px-5 py-3 text-right ${c.balanceCents ? 'font-medium text-slate-900' : 'text-slate-400'}`}
                      >
                        {money(c.balanceCents)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{c.lastJobAt ? day(c.lastJobAt, org.timezone) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              <span>
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
      {creating ? <CustomerForm onClose={() => setCreating(false)} /> : null}
    </>
  );
}
