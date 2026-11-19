import { Suspense } from 'react';
import { InstitutionsList } from '@/features/platform/institutions';

export const metadata = { title: 'Institutions' };

export default function Page() {
  return (
    <Suspense>
      <InstitutionsList />
    </Suspense>
  );
}
