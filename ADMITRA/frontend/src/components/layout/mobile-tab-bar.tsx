'use client';

import { BookOpen, Compass, LayoutGrid, ListChecks, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { homeFor, useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { isActive } from './public-header';

/** On phones the top navigation becomes a bottom tab bar (Section 4.1.6). */
export function MobileTabBar() {
  const pathname = usePathname();
  const auth = useAuth();
  const account = auth.user ? homeFor(auth.user, auth.memberships) : '/login';
  const tabs = [
    { href: '/', label: 'Home', icon: LayoutGrid },
    { href: '/advisor', label: 'Advisor', icon: Compass },
    { href: '/directory', label: 'Directory', icon: BookOpen },
    { href: '/merit-lists', label: 'Results', icon: ListChecks },
    { href: account, label: auth.user ? 'Account' : 'Log in', icon: UserRound },
  ];
  return (
    <nav
      aria-label="Bottom"
      className="border-line bg-card/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = isActive(pathname, t.href);
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
  );
}
