import { Suspense } from 'react';
import { DirectoryPage } from '@/features/directory/directory-page';

export const metadata = { title: 'Directory' };

export default function Page() {
  return (
    <div className="page-container py-8">
      <Suspense>
        <DirectoryPage />
      </Suspense>
    </div>
  );
}
