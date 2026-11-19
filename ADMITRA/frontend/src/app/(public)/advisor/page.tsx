import { Suspense } from 'react';
import { AdvisorPage } from '@/features/advisor/advisor-page';

export const metadata = { title: 'Admission Advisor' };

export default function Page() {
  return (
    <div className="page-container py-8">
      <Suspense>
        <AdvisorPage />
      </Suspense>
    </div>
  );
}
