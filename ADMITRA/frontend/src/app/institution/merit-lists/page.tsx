import { Suspense } from 'react';
import { MeritListsPage } from '@/features/merit/merit-lists';

export const metadata = { title: 'Merit Lists' };

export default function Page() {
  return (
    <Suspense>
      <MeritListsPage />
    </Suspense>
  );
}
