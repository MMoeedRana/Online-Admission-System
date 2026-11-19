import { Suspense } from 'react';
import { ComparePage } from '@/features/advisor/compare-page';

export const metadata = { title: 'Compare programs' };

export default function Page() {
  return (
    <>
      <Suspense>
        <ComparePage base="/applicant" />
      </Suspense>
    </>
  );
}
