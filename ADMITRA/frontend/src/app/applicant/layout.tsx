import { ApplicantShell } from '@/features/applicant/applicant-shell';
import { RequireAuth } from '@/features/auth/require-auth';

export default function ApplicantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth area="applicant">
      <ApplicantShell>{children}</ApplicantShell>
    </RequireAuth>
  );
}
