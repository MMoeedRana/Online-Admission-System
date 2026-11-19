import { Suspense } from 'react';
import { DirectoryProgramDetail } from '@/features/directory/program-detail';

export const metadata = { title: 'Program' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="page-container py-8">
      <Suspense>
        <DirectoryProgramDetail id={id} />
      </Suspense>
    </div>
  );
}
