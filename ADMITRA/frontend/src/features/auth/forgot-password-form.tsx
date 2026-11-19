'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { post } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { email } from './schemas';

const schema = z.object({ email });

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState('');
  const { register, handleSubmit, setError, formState } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  if (sentTo) {
    return (
      <div className="text-center">
        <MailCheck className="text-primary mx-auto size-14" />
        <h1 className="mt-4 text-[24px] font-bold">Check your e-mail</h1>
        <p className="text-muted mt-2 text-[14px]">
          If an account exists for <b className="text-ink">{sentTo}</b>, we sent a link to reset the password. The link
          works once and is valid for 30 minutes.
        </p>
        <ButtonLink href="/login" variant="secondary" className="mt-6">
          Back to log in
        </ButtonLink>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Forgot your password?</h1>
      <p className="text-muted mt-1 text-[14px]">
        Enter your e-mail and we will send you a link to set a new password.
      </p>
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(async (v) => {
          try {
            await post('/auth/forgot-password', v);
            setSentTo(v.email);
          } catch (err) {
            handleFormError(err, setError);
          }
        })}
      >
        <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-[13.5px]">
        <Link href="/login" className="text-primary font-semibold hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
