'use client';

import { PageFade } from '@/components/ui/motion';
import { Bookmark, Compass, FileText, LayoutGrid, ListChecks, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';
import { NotificationBell } from '@/components/layout/notification-bell';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/applicant/dashboard', label: 'Dashboard', icon: LayoutGrid, match: ['/applicant/dashboard'] },
  {
    href: '/applicant/records',
    label: 'Profile & Marks',
    icon: ShieldCheck,
    match: ['/applicant/records', '/applicant/profile'],
  },
  {
    href: '/applicant/applications',
    label: 'Applications',
    icon: FileText,
    match: ['/applicant/applications', '/applicant/apply'],
  },
  {
    href: '/applicant/results',
    label: 'My Results',
    icon: ListChecks,
    match: ['/applicant/results', '/applicant/offers'],
  },
  { href: '/applicant/advisor', label: 'Advisor', icon: Compass, match: ['/applicant/advisor', '/applicant/compare'] },
  { href: '/applicant/shortlist', label: 'Shortlist', icon: Bookmark, match: ['/applicant/shortlist'] },
];

const TABS = [
  { href: '/applicant/dashboard', label: 'Home', icon: LayoutGrid, match: ['/applicant/dashboard'] },
  {
    href: '/applicant/advisor',
    label: 'Advisor',
    icon: Compass,
    match: ['/applicant/advisor', '/applicant/compare', '/applicant/shortlist'],
  },
  {
    href: '/applicant/applications',
    label: 'Apply',
    icon: FileText,
    match: ['/applicant/applications', '/applicant/apply'],
  },
  {
    href: '/applicant/results',
    label: 'Results',
    icon: ListChecks,
    match: ['/applicant/results', '/applicant/offers'],
  },
  {
    href: '/applicant/records',
    label: 'Profile',
    icon: UserRound,
    match: ['/applicant/records', '/applicant/profile', '/account', '/notifications'],
  },
];

const on = (pathname: string, match: string[]) => match.some((m) => pathname === m || pathname.startsWith(m + '/'));

export function ApplicantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <header className="border-line bg-card/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="page-container flex h-16 items-center gap-4 lg:h-[72px]">
          <Logo href="/applicant/dashboard" />
          <nav aria-label="Applicant" className="ml-4 hidden items-center gap-0.5 lg:flex xl:ml-6 xl:gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-[14.5px] font-medium',
                  on(pathname, n.match) ? 'text-primary font-semibold' : 'text-body hover:text-ink',
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle className="hidden sm:flex" />
            <NotificationBell />
            <div className="hidden text-right lg:block">
              <p className="text-ink text-[13.5px] leading-tight font-semibold">{user?.fullName}</p>
              <p className="text-muted text-[12px]">Applicant</p>
            </div>
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="page-container py-6 sm:py-8">
        <PageFade>{children}</PageFade>
      </main>
      <nav
        aria-label="Bottom"
        className="border-line bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = on(pathname, t.match);
            return (
              <li key={t.label}>
                <Link
                  href={t.href}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                    active ? 'text-primary' : 'text-muted',
                  )}
                >
                  <t.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
