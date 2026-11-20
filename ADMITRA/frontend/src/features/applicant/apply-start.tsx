'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { FullPageLoader } from '@/components/ui/spinner';
import { errorMessage, post, type ApiErrorBody } from '@/lib/api';
import type { AxiosError } from 'axios';

export function ApplyStart() {
  const sp = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const campaignId = sp.get('campaign');
    if (!campaignId) {
      router.replace('/programs?openOnly=true');
      return;
    }
    post<{ _id: string }>('/me/applications', { campaignId, programId: sp.get('program') ?? undefined })
      .then((a) => router.replace(`/applicant/applications/${a._id}`))
      .catch((err: AxiosError<ApiErrorBody>) => {
        const existing = (err.response?.data?.error?.details as { applicationId?: string } | undefined)?.applicationId;
        if (existing) router.replace(`/applicant/applications/${existing}`);
        else setError(errorMessage(err));
      });
  }, [sp, router]);
  if (!error) return <FullPageLoader />;
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Alert tone="error" title="The application could not be started">
        {error}
      </Alert>
      <ButtonLink href="/programs?openOnly=true" variant="secondary">
        Back to programs
      </ButtonLink>
    </div>
  );
}
