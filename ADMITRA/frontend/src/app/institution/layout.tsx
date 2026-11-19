import { RequireAuth } from '@/features/auth/require-auth';
import { InstitutionShell } from '@/features/institution/institution-shell';

export default function InstitutionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth area="institution">
      <InstitutionShell>{children}</InstitutionShell>
    </RequireAuth>
  );
}
