'use client';

import type { ReactNode } from 'react';
import { StaffShell } from '@/components/layout/staff-shell';
import { platformNav } from './nav';

export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <StaffShell
      sections={platformNav}
      roleLabel="Super Admin"
      orgName="ADMITRA Platform"
      search={{
        placeholder: 'Search institutions...',
        href: (q) => `/platform/institutions?q=${encodeURIComponent(q)}`,
      }}
    >
      {children}
    </StaffShell>
  );
}
