'use client';

import { ChevronDown, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { initials } from '@/lib/utils';

export function Avatar({ name, className = 'size-10 text-[13px]' }: { name: string; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-rose-500 font-bold text-white ${className}`}
    >
      {initials(name) || 'U'}
    </span>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-card-soft flex items-center gap-2 rounded-xl p-1 pr-2"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar name={user.fullName} className="size-9 text-[12px]" />
        <ChevronDown className="text-muted hidden size-4 sm:block" />
      </button>
      {open && (
        <div className="border-line bg-card absolute right-0 z-40 mt-2 w-64 rounded-2xl border p-2 shadow-[var(--shadow-pop)]">
          <div className="border-line border-b px-3 pt-2 pb-3">
            <p className="text-ink truncate text-[14px] font-bold">{user.fullName}</p>
            <p className="text-muted truncate text-[12.5px]">{user.email}</p>
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="hover:bg-card-soft mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px]"
          >
            <Settings className="size-4" /> Account settings
          </Link>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
