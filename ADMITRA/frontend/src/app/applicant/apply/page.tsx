import { Suspense } from 'react';
import { ApplyStart } from '@/features/applicant/apply-start';

export const metadata = { title: 'Apply' };

export default function Page() {
  return (
    <Suspense>
      <ApplyStart />
    </Suspense>
  );
}
