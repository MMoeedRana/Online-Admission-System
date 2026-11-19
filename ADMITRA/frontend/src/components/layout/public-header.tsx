'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { homeFor, useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { ButtonLink } from '../ui/button';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

export const PUBLIC_NAV = [
  { href: '/', label: 'Home' },
  { href: '/advisor', label: 'Admission Advisor' },
  { href: '/directory', label: 'Directory' },
  { href: '/programs', label: 'Open Programs' },
  { href: '/merit-lists', label: 'Merit Lists' },
  { href: '/status', label: 'Check Status' },
];

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

/** White top bar used by visitors and applicants (Section 4.1.1). */
export function PublicHeader() {
  const pathname = usePathname();
  const auth = useAuth();
  return (
    <header className="border-line bg-card/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="page-container flex h-16 items-center gap-6 lg:h-[72px]">
        <Logo />
        <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 lg:flex xl:ml-6 xl:gap-1">
          {PUBLIC_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'rounded-lg px-3 py-2 text-[14.5px] font-medium transition',
                isActive(pathname, n.href) ? 'text-primary font-semibold' : 'text-body hover:text-ink',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle className="hidden sm:flex" />
          {auth.status === 'authenticated' && auth.user ? (
            <>
              <ButtonLink
                href={homeFor(auth.user, auth.memberships)}
                size="sm"
                variant="primary"
                className="hidden sm:inline-flex"
              >
                My dashboard
              </ButtonLink>
              <UserMenu />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="secondary" size="sm" className="h-10 px-4 sm:px-5">
                Log in
              </ButtonLink>
              <ButtonLink href="/register" size="sm" className="h-10 px-4 sm:px-5">
                Register
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
