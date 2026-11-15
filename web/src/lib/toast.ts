// A tiny toast store: any code can call toast(), and <Toaster /> shows the messages.
export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

let toasts: Toast[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: Toast['tone'] = 'success') {
  const id = next++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3800);
}

export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const snapshot = () => toasts;
