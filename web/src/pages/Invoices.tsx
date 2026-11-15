import { ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '../components/Layout.tsx';
import { Card, Empty, Input, InvoiceBadge, Spinner, Button } from '../components/ui.tsx';
import { cx } from '../lib/cx.ts';
import { day, money, moneyShort } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useInvoices } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'sent', label: 'Sent' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
] as const;

export function Invoices() {
  const { org } = useAuthed();
  const panels = usePanels();
  const [status, setStatus] = useState<(typeof TABS)[number]['id']>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useInvoices({ status, search: search.trim(), page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const t = data?.totals;

  return (
    <>
      <PageHeader title="Invoices" subtitle="Finished jobs become invoices. Open a job to create one." />
      {t ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['draft', 'Drafts to send', t.draft, 'text-slate-900'],
              ['sent', 'Sent, not yet due', t.sent, 'text-sky-700'],
              ['overdue', 'Overdue', t.overdue, 'text-rose-600'],
              ['paid', 'Paid all time', t.paid, 'text-emerald-700'],
            ] as const
          ).map(([id, label, v, color]) => (
            <button
              key={id}
              type="button"
              onClick={() => (setStatus(id), setPage(1))}
              className={cx(
                'rounded-xl bg-white p-4 text-left shadow-sm ring-1 transition hover:ring-orange-300',
                status === id ? 'ring-2 ring-orange-400' : 'ring-slate-200',
              )}
            >
              <div className="text-sm text-slate-500">{label}</div>
              <div className={cx('tabular mt-1 text-2xl font-semibold', color)}>{moneyShort(v.cents)}</div>
              <div className="text-xs text-slate-500">{v.count} invoices</div>
            </button>
          ))}
        </div>
      ) : null}
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={status === tab.id}
                onClick={() => (setStatus(tab.id), setPage(1))}
                className={cx(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  status === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => (setSearch(e.target.value), setPage(1))}
              placeholder="Invoice, customer or job number"
              className="pl-9"
              aria-label="Search invoices"
            />
          </div>
        </div>
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Empty icon={<FileText className="size-5" />} title="No invoices here">
            {status === 'overdue' ? 'Nothing is overdue. Nice.' : 'Try another filter or search.'}
          </Empty>
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Invoice</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Issued</th>
                    <th className="px-5 py-3">Due</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((i) => (
                    <tr key={i.id} onClick={() => panels.open('invoice', i.id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{i.number}</div>
                        <div className="text-xs text-slate-500">{i.jobNumber ?? 'No job'}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{i.customer.name}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{i.issuedAt ? day(i.issuedAt, org.timezone) : '—'}</td>
                      <td
                        className={cx(
                          'whitespace-nowrap px-5 py-3',
                          i.status === 'overdue' ? 'font-medium text-rose-600' : 'text-slate-600',
                        )}
                      >
                        {i.paidAt ? `Paid ${day(i.paidAt, org.timezone)}` : i.dueAt ? day(i.dueAt, org.timezone) : '—'}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right font-medium">{money(i.totalCents)}</td>
                      <td className="px-5 py-3">
                        <InvoiceBadge status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              <span>
                {data.total} invoices · page {page} of {pages}
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
    </>
  );
}
