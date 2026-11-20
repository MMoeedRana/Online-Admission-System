'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { handleFormError } from '@/lib/forms';
import { homeFor, useAuth } from './auth-context';
import { PasswordInput } from './password-input';
import { email } from './schemas';

const schema = z.object({ email, password: z.string().min(1, 'Enter your password.') });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { register, handleSubmit, setError, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const e = formState.errors;

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Welcome back</h1>
      <p className="text-muted mt-1 text-[14px]">Log in to continue to ADMITRA.</p>
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(async (v) => {
          try {
            const s = await login(v.email, v.password);
            router.replace(
              next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(s.user, s.memberships),
            );
          } catch (err) {
            handleFormError(err, setError);
          }
        })}
      >
        <Field label="E-mail" htmlFor="email" error={e.email?.message}>
          <Input
            placeholder="you@example.com"
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!e.email}
            {...register('email')}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={e.password?.message}>
          <PasswordInput
            placeholder="Enter your password"
            id="password"
            autoComplete="current-password"
            aria-invalid={!!e.password}
            {...register('password')}
          />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-primary text-[13px] font-semibold hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="text-muted mt-6 text-center text-[13.5px]">
        New to ADMITRA?{' '}
        <Link href="/register" className="text-primary font-semibold hover:underline">
          Create an applicant account
        </Link>
      </p>
    </>
  );
}
