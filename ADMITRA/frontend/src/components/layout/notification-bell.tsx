'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { markRead, NOTIF_KEY, useNotifications } from '@/features/notifications/notifications';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useNotifications(6);
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const unread = q.data?.unread ?? 0;
  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="border-line bg-card text-body hover:text-ink relative flex size-10 items-center justify-center rounded-xl border"
      >
        <Bell className="size-[18px]" aria-hidden />
        <span className="sr-only">Notifications</span>
        {unread > 0 && (
          <span className="ring-card absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2">
            {unread > 9 ? '9+' : unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </button>
      {open && (
        <div className="border-line bg-card absolute right-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <p className="text-ink text-[13.5px] font-bold">Notifications</p>
            {unread > 0 && (
              <button
                className="text-primary text-[12px] font-semibold"
                onClick={async () => {
                  await markRead();
                  void qc.invalidateQueries({ queryKey: NOTIF_KEY });
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          {q.data?.items.length ? (
            <ul className="max-h-96 overflow-y-auto">
              {q.data.items.map((n) => (
                <li key={n._id}>
                  <button
                    className="hover:bg-card-soft flex w-full gap-3 rounded-xl px-3 py-2.5 text-left"
                    onClick={async () => {
                      setOpen(false);
                      if (!n.readAt) await markRead(n._id);
                      void qc.invalidateQueries({ queryKey: NOTIF_KEY });
                      if (n.link) router.push(n.link);
                    }}
                  >
                    <span
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')}
                    />
                    <span className="min-w-0">
                      <span className="text-ink block text-[13px] font-semibold">{n.title}</span>
                      {n.body && <span className="text-body line-clamp-2 block text-[12.5px]">{n.body}</span>}
                      <span className="text-muted block text-[11.5px]">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-muted px-3 py-8 text-center text-[13px]">You have no notifications yet.</div>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="text-primary hover:bg-card-soft mt-1 block rounded-xl px-3 py-2 text-center text-[13px] font-semibold"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
