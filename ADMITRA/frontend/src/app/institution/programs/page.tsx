import { Suspense } from 'react';
import { ProgramsList } from '@/features/institution/programs';

export const metadata = { title: 'Programs' };

export default function Page() {
  return (
    <Suspense>
      <ProgramsList />
    </Suspense>
  );
}
