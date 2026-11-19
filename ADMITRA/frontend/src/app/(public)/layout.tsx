import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-16 lg:pb-0">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <MobileTabBar />
    </div>
  );
}
