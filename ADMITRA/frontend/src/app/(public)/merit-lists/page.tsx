import { Suspense } from 'react';
import { PublicMeritLists } from '@/features/results/public-lists';

export const metadata = { title: 'Merit lists' };

export default function Page() {
  return (
    <div className="page-container py-8">
      <Suspense>
        <PublicMeritLists />
      </Suspense>
    </div>
  );
}
