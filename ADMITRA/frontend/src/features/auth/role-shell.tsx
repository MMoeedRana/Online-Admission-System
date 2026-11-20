'use client';

import type { ReactNode } from 'react';
import { ApplicantShell } from '@/features/applicant/applicant-shell';
import { InstitutionShell } from '@/features/institution/institution-shell';
import { PlatformShell } from '@/features/platform/platform-shell';
import { useAuth } from './auth-context';
import { RequireAuth } from './require-auth';

export function RoleShell({ children }: { children: ReactNode }) {
  const { user, memberships } = useAuth();
  let shell: ReactNode;
  if (user?.platformRole === 'SUPER_ADMIN') shell = <PlatformShell>{children}</PlatformShell>;
  else if (user?.accountType === 'STAFF' && memberships.length) shell = <InstitutionShell>{children}</InstitutionShell>;
  else shell = <ApplicantShell>{children}</ApplicantShell>;
  return <RequireAuth area="any">{shell}</RequireAuth>;
}
