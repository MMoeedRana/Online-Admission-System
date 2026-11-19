'use client';

import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: number;
  type: 'success' | 'error';
  message: string;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(type: ToastItem['type'], message: string) {
  const id = ++seq;
  items = [...items, { id, type, message }].slice(-4);
  emit();
  setTimeout(() => dismiss(id), 4500);
}
function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
};

const EMPTY: ToastItem[] = [];

/** Toasts appear top-right on desktop and at the bottom on phones (Section 4.1.3). */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => EMPTY,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-auto sm:w-96"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="border-line bg-card pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-[var(--shadow-pop)]"
        >
          {t.type === 'success' ? (
            <CheckCircle2 className="size-5 shrink-0 text-green-600" />
          ) : (
            <XCircle className="size-5 shrink-0 text-red-600" />
          )}
          <p className={cn('text-ink flex-1 text-[13.5px] font-medium')}>{t.message}</p>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
