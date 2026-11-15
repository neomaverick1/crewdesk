import { useSearchParams } from 'react-router';

export type PanelKind = 'job' | 'customer' | 'invoice';

/** Job, customer and invoice panels open over any page through the address (?job=12), so they can be linked to. */
export function usePanels() {
  const [params, setParams] = useSearchParams();
  const open = (kind: PanelKind, id: number) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const k of ['job', 'customer', 'invoice']) next.delete(k);
      next.set(kind, String(id));
      return next;
    });
  const close = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const k of ['job', 'customer', 'invoice']) next.delete(k);
      return next;
    });
  const id = (kind: PanelKind) => {
    const v = Number(params.get(kind));
    return Number.isInteger(v) && v > 0 ? v : null;
  };
  return { open, close, id };
}
