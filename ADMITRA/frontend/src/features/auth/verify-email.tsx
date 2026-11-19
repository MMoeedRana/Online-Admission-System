'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage, post } from '@/lib/api';
import { homeFor, useAuth } from './auth-context';

export function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);
  const auth = useAuth();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    post('/auth/verify-email', { token })
      .then(() => setState('ok'))
      .catch((err) => {
        setMessage(errorMessage(err));
        setState('error');
      });
  }, [token]);

  const next = auth.user ? homeFor(auth.user, auth.memberships) : '/login';
  return (
    <div className="text-center">
      {state === 'loading' && (
        <>
          <Spinner className="text-primary size-8" />
          <p className="text-muted mt-4 text-[14px]">Verifying your e-mail...</p>
        </>
      )}
      {state === 'ok' && (
        <>
          <CheckCircle2 className="mx-auto size-14 text-green-600" />
          <h1 className="mt-4 text-[24px] font-bold">E-mail verified</h1>
          <p className="text-muted mt-2 text-[14px]">Thank you. Your e-mail address is now confirmed.</p>
          <ButtonLink href={next} className="mt-6">
            Continue
          </ButtonLink>
        </>
      )}
      {state === 'error' && (
        <>
          <XCircle className="mx-auto size-14 text-red-600" />
          <h1 className="mt-4 text-[24px] font-bold">Link not valid</h1>
          <p className="text-muted mt-2 text-[14px]">{message}</p>
          <p className="text-muted mt-1 text-[13px]">You can request a new link from your dashboard.</p>
          <ButtonLink href={next} variant="secondary" className="mt-6">
            Go back
          </ButtonLink>
        </>
      )}
    </div>
  );
}
