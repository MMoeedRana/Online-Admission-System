'use client';

import { PageHeader } from '@/components/ui/page-header';
import { RegistryImport } from './registry-import';

export function PlatformRegistry() {
  return (
    <>
      <PageHeader
        title="Registry Import"
        subtitle="Official board results used to verify applicants' marks automatically"
      />
      <RegistryImport
        base="/platform/registry"
        queryKey={['platform', 'registry']}
        template={{ href: '/templates/board-result-registry-template.csv', label: 'Download template' }}
        intro="Matric, Intermediate and degree results from the board gazettes (REG-1). Rows are matched by board, exam, year and roll number."
      />
    </>
  );
}
