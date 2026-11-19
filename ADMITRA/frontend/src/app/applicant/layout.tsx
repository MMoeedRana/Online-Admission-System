import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { PublicHeader } from '@/components/layout/public-header';
import { RequireAuth } from '@/features/auth/require-auth';

export default function ApplicantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <PublicHeader />
      <RequireAuth area="applicant">
        <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </RequireAuth>
      <MobileTabBar />
    </div>
  );
}
