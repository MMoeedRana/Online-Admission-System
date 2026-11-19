import { Suspense } from 'react';
import { OffersPage } from '@/features/merit/offers';

export const metadata = { title: 'Offers & Enrollment' };

export default function Page() {
  return (
    <Suspense>
      <OffersPage />
    </Suspense>
  );
}
