import { RequireAuth } from '@/features/auth/require-auth';
import { PlatformShell } from '@/features/platform/platform-shell';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth area="platform">
      <PlatformShell>{children}</PlatformShell>
    </RequireAuth>
  );
}
