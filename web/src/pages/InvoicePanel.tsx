import { Ban, CreditCard, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { InvoiceDetail, InvoiceLine } from '../../../server/types.ts';
import { Button, Drawer, ErrorNote, Input, InvoiceBadge, Spinner } from '../components/ui.tsx';
import { RequestError } from '../lib/api.ts';
import { day, money } from '../lib/format.ts';
import { usePanels } from '../lib/panels.ts';
import { useInvoice, useInvoiceActions } from '../lib/queries.ts';
import { useAuthed } from '../lib/session.ts';
import { toast } from '../lib/toast.ts';

function LineEditor({ invoice, onDone }: { invoice: InvoiceDetail; onDone: () => void }) {
  const { update } = useInvoiceActions();
  const [lines, setLines] = useState(
    invoice.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unit: (l.unitCents / 100).toFixed(2) })),
  );
  const [tax, setTax] = useState(String(invoice.taxBps / 100));
  const parsed: InvoiceLine[] = lines.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unitCents: Math.round(Number(l.unit) * 100),
  }));
  const subtotal = parsed.reduce((s, l) => s + (Number.isFinite(l.quantity * l.unitCents) ? Math.round(l.quantity * l.unitCents) : 0), 0);
  const fields = update.error instanceof RequestError ? update.error.fields : {};
  const edit = (i: number, k: 'description' | 'quantity' | 'unit', v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_64px_96px_32px] items-center gap-2">
          <Input
            value={l.description}
            onChange={(e) => edit(i, 'description', e.target.value)}
            aria-label="Description"
            invalid={!!fields[`lines.${i}.description`]}
          />
          <Input
            value={l.quantity}
            onChange={(e) => edit(i, 'quantity', e.target.value)}
            aria-label="Quantity"
            inputMode="decimal"
            className="text-right"
            invalid={!!fields[`lines.${i}.quantity`]}
          />
          <Input
            value={l.unit}
            onChange={(e) => edit(i, 'unit', e.target.value)}
            aria-label="Unit price"
            inputMode="decimal"
            className="text-right"
            invalid={!!fields[`lines.${i}.unitCents`]}
          />
          <button
            type="button"
            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Remove line"
            disabled={lines.length === 1}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, { description: '', quantity: '1', unit: '0.00' }])}>
          <Plus className="size-3.5" /> Add line
        </Button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Tax %
          <Input value={tax} onChange={(e) => setTax(e.target.value)} className="w-20 text-right" inputMode="decimal" />
        </label>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Subtotal</span>
        <span className="tabular font-semibold">{money(subtotal)}</span>
      </div>
      {update.error && !Object.keys(fields).length ? <ErrorNote error={update.error} /> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          busy={update.isPending}
          onClick={() =>
            update.mutate(
              { id: invoice.id, lines: parsed, taxBps: Math.round(Number(tax || 0) * 100) },
              { onSuccess: () => (toast('Invoice updated'), onDone()) },
            )
          }
        >
          Save lines
        </Button>
      </div>
    </div>
  );
}

export function InvoicePanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { org, can } = useAuthed();
  const panels = usePanels();
  const { data: inv, isLoading, error } = useInvoice(id);
  const actions = useInvoiceActions();
  const [editing, setEditing] = useState(false);
  const done = (message: string) => ({ onSuccess: () => toast(message), onError: (e: Error) => toast(e.message, 'error') });

  return (
    <Drawer
      title={inv ? inv.number : 'Invoice'}
      subtitle={inv ? <InvoiceBadge status={inv.status} /> : null}
      onClose={onClose}
      actions={
        inv ? (
          <Button size="sm" variant="ghost" onClick={() => window.print()} aria-label="Print">
            <Printer className="size-4" />
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
      ) : inv ? (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            {inv.status === 'draft' && !editing ? (
              <>
                <Button
                  variant="primary"
                  busy={actions.send.isPending}
                  onClick={() => actions.send.mutate({ id: inv.id }, done(`${inv.number} sent to ${inv.customer.name}`))}
                >
                  <Send className="size-4" /> Send invoice
                </Button>
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit lines
                </Button>
              </>
            ) : null}
            {inv.status === 'sent' || inv.status === 'overdue' ? (
              <Button
                variant="primary"
                busy={actions.pay.isPending}
                onClick={() => actions.pay.mutate(inv.id, done(`Payment recorded for ${inv.number}`))}
              >
                <CreditCard className="size-4" /> Record payment
              </Button>
            ) : null}
            {can('owner') && inv.status !== 'paid' && inv.status !== 'void' ? (
              <Button
                variant="ghost"
                onClick={() => window.confirm(`Void ${inv.number}?`) && actions.void.mutate(inv.id, done(`${inv.number} voided`))}
              >
                <Ban className="size-4" /> Void
              </Button>
            ) : null}
            {inv.jobId ? (
              <Button variant="ghost" onClick={() => panels.open('job', inv.jobId!)}>
                Open {inv.jobNumber}
              </Button>
            ) : null}
          </div>

          {editing ? (
            <LineEditor invoice={inv} onDone={() => setEditing(false)} />
          ) : (
            <article className="print-area rounded-xl p-6 ring-1 ring-slate-200">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">{org.name}</div>
                  <div className="text-sm text-slate-500">Invoice {inv.number}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-slate-500">Issued</div>
                  <div className="font-medium">{inv.issuedAt ? day(inv.issuedAt, org.timezone) : 'Draft'}</div>
                  {inv.dueAt ? (
                    <>
                      <div className="mt-1 text-slate-500">{inv.paidAt ? 'Paid' : 'Due'}</div>
                      <div className={inv.status === 'overdue' ? 'font-medium text-rose-600' : 'font-medium'}>
                        {day(inv.paidAt ?? inv.dueAt, org.timezone)}
                      </div>
                    </>
                  ) : null}
                </div>
              </header>
              <div className="mt-6 text-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Bill to</div>
                <div className="mt-1 font-medium">{inv.customer.name}</div>
                <div className="text-slate-600">
                  {inv.customer.address}, {inv.customer.city}
                </div>
                {inv.customer.email ? <div className="text-slate-600">{inv.customer.email}</div> : null}
              </div>
              <table className="mt-6 w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">Description</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inv.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2.5 pr-3">{l.description}</td>
                      <td className="tabular py-2.5 text-right">{l.quantity}</td>
                      <td className="tabular py-2.5 text-right">{money(l.unitCents)}</td>
                      <td className="tabular py-2.5 text-right">{money(Math.round(l.quantity * l.unitCents))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="ml-auto mt-4 w-56 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular">{money(inv.subtotalCents)}</dd>
                </div>
                {inv.taxBps ? (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Tax ({inv.taxBps / 100}%)</dt>
                    <dd className="tabular">{money(inv.taxCents)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{money(inv.totalCents)}</dd>
                </div>
              </dl>
            </article>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
