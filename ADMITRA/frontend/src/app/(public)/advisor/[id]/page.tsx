import { Suspense } from 'react';
import { ExplainPage } from '@/features/advisor/explain-page';

export const metadata = { title: 'Explain my chance' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-container py-8">
      <Suspense>
        <ExplainPage id={id} />
      </Suspense>
    </div>
  );
}
