import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/features/auth/verify-email';

export const metadata: Metadata = { title: 'Verify e-mail' };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
