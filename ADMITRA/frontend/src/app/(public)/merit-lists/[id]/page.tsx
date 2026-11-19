import { Suspense } from 'react';
import { PublicMeritList } from '@/features/results/public-lists';

export const metadata = { title: 'Merit list' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-container py-8">
      <Suspense>
        <PublicMeritList id={id} />
      </Suspense>
    </div>
  );
}
