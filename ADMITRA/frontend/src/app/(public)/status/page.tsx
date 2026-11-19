import { Suspense } from 'react';
import { StatusLookup } from '@/features/results/status-lookup';

export const metadata = { title: 'Check status' };

export default function Page() {
  return (
    <div className="page-container py-8">
      <Suspense>
        <StatusLookup />
      </Suspense>
    </div>
  );
}
