'use client';

import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { PublicHeader } from '@/components/layout/public-header';
import { useAuth } from '@/features/auth/auth-context';
import { RequireAuth } from '@/features/auth/require-auth';
import { InstitutionShell } from '@/features/institution/institution-shell';
import { PlatformShell } from '@/features/platform/platform-shell';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, memberships } = useAuth();
  if (user?.platformRole === 'SUPER_ADMIN') {
    return <PlatformShell>{children}</PlatformShell>;
  }
  if (user?.accountType === 'STAFF' && memberships.length) return <InstitutionShell>{children}</InstitutionShell>;
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <PublicHeader />
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <MobileTabBar />
    </div>
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth area="any">
      <Shell>{children}</Shell>
    </RequireAuth>
  );
}
