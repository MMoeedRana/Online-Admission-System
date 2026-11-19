'use client';

import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Notifications bell shown on every signed-in page (NOTIF-1). Live notifications are added in Phase 2. */
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="border-line bg-card text-body hover:text-ink flex size-10 items-center justify-center rounded-xl border"
      >
        <Bell className="size-[18px]" />
      </button>
      {open && (
        <div className="border-line bg-card absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-[var(--shadow-pop)]">
          <p className="text-ink px-3 pt-2 pb-1 text-[13px] font-bold">Notifications</p>
          <div className="text-muted px-3 py-8 text-center text-[13px]">You have no notifications yet.</div>
        </div>
      )}
    </div>
  );
}
