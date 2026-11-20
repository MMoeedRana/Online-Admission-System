'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { FullPageLoader } from '@/components/ui/spinner';
import { homeFor, useAuth } from './auth-context';

type Area = 'applicant' | 'institution' | 'platform' | 'any';

function allowed(area: Area, auth: ReturnType<typeof useAuth>) {
  const u = auth.user;
  if (!u) return false;
  if (area === 'any') return true;
  if (area === 'platform') return u.platformRole === 'SUPER_ADMIN';
  if (area === 'applicant') return u.accountType === 'APPLICANT';
  return u.accountType === 'STAFF' && auth.memberships.length > 0;
}

export function RequireAuth({ area, children }: { area: Area; children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (auth.status === 'guest') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (auth.status === 'authenticated' && !allowed(area, auth))
      router.replace(homeFor(auth.user!, auth.memberships));
  }, [auth, area, router, pathname]);

  if (auth.status !== 'authenticated' || !allowed(area, auth)) return <FullPageLoader />;
  return <>{children}</>;
}
