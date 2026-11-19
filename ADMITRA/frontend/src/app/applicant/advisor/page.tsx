import { Suspense } from 'react';
import { AdvisorPage } from '@/features/advisor/advisor-page';

export const metadata = { title: 'Admission Advisor' };

export default function Page() {
  return (
    <>
      <Suspense>
        <AdvisorPage base="/applicant" />
      </Suspense>
    </>
  );
}
