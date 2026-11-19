import { Suspense } from 'react';
import { ApplicationsQueue } from '@/features/staff/applications';

export const metadata = { title: 'Applications' };

export default function Page() {
  return (
    <Suspense>
      <ApplicationsQueue />
    </Suspense>
  );
}
