import { Suspense } from 'react';
import { MeritFormulas } from '@/features/merit/formulas';

export const metadata = { title: 'Merit Formulas' };

export default function Page() {
  return (
    <Suspense>
      <MeritFormulas />
    </Suspense>
  );
}
