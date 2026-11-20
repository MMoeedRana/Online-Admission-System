'use client';

import type { ReactNode } from 'react';
import { StaffShell } from '@/components/layout/staff-shell';
import { platformNav } from './nav';
import { useBrand } from '@/features/branding/brand-context';
import { MitraLauncher } from '@/features/mitra/launcher';

export function PlatformShell({ children }: { children: ReactNode }) {
  const brand = useBrand();
  return (
    <StaffShell
      sections={platformNav}
      roleLabel="Super Admin"
      orgName={`${brand.platformName} Platform`}
      search={{
        placeholder: 'Search institutions...',
        href: (q) => `/platform/institutions?q=${encodeURIComponent(q)}`,
      }}
      assistant={<MitraLauncher scope="platform" />}
    >
      {children}
    </StaffShell>
  );
}
