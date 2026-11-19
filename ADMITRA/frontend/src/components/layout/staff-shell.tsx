'use client';

import type { LucideIcon } from 'lucide-react';
import { Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { LogoMark } from './logo';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import { Avatar, UserMenu } from './user-menu';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

interface Props {
  sections: NavSection[];
  roleLabel: string;
  orgName: string;
  search?: { placeholder: string; href: (q: string) => string };
  headerExtra?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

function Sidebar({
  sections,
  roleLabel,
  orgName,
  onNavigate,
}: Pick<Props, 'sections' | 'roleLabel' | 'orgName'> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, can } = useAuth();
  return (
    <div className="bg-navy flex h-full flex-col text-slate-300">
      <div className="flex h-[76px] items-center gap-3 px-6">
        <LogoMark />
        <span className="text-[20px] font-extrabold tracking-tight text-white">ADMITRA</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 pb-4" aria-label="Workspace">
        {sections.map((s, i) => (
          <div key={s.title} className={cn(i > 0 && 'mt-6')}>
            <p className="px-3 pb-2 text-[11.5px] font-semibold tracking-[0.12em] text-slate-400 uppercase">
              {i === 0 ? roleLabel : s.title}
            </p>
            <ul className="space-y-1">
              {s.items
                .filter((it) => !it.permission || can(it.permission))
                .map((it) => {
                  const active = pathname === it.href || pathname.startsWith(it.href + '/');
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium transition',
                          active
                            ? 'bg-primary text-white shadow-[0_6px_18px_rgba(31,111,235,0.35)]'
                            : 'hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <it.icon className="size-[19px]" strokeWidth={1.8} />
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
      {user && (
        <div className="bg-navy-line/70 m-4 flex items-center gap-3 rounded-2xl p-3.5">
          <Avatar name={user.fullName} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-white">{user.fullName}</p>
            <p className="truncate text-[12.5px] text-slate-400">{orgName}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Staff and super admin layout: navy sidebar, header with search, theme, notifications and account (Section 4.1.7). */
export function StaffShell({ sections, roleLabel, orgName, search, headerExtra, banner, children }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const router = useRouter();

  return (
    <div className="bg-page min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] lg:block xl:w-[260px]">
        <Sidebar sections={sections} roleLabel={roleLabel} orgName={orgName} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 right-3 z-10 rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
            <Sidebar sections={sections} roleLabel={roleLabel} orgName={orgName} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[240px] xl:pl-[260px]">
        <header className="border-line bg-card/90 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur sm:px-6 lg:h-[76px] lg:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="border-line bg-card text-ink flex size-10 items-center justify-center rounded-xl border lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          {headerExtra}
          {search && (
            <form
              className="ml-auto hidden w-full max-w-md items-center md:flex"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) router.push(search.href(q.trim()));
              }}
            >
              <label className="relative w-full">
                <span className="sr-only">Search</span>
                <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={search.placeholder}
                  className="border-line bg-card-soft text-ink placeholder:text-muted focus:border-primary h-11 w-full rounded-xl border pr-3 pl-10 text-[14px] outline-none focus:ring-4 focus:ring-[var(--ring)]"
                />
              </label>
            </form>
          )}
          <div className={cn('flex items-center gap-2 sm:gap-3', !search && 'ml-auto', search && 'ml-auto md:ml-0')}>
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        {banner}
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
