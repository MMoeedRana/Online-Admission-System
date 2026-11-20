'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { post } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import type { Session } from '@/lib/types';
import { useAuth } from './auth-context';
import { PasswordChecklist, PasswordInput } from './password-input';
import { email, fullName, password } from './schemas';

const schema = z
  .object({ fullName, email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });
type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const { applySession } = useAuth();
  const router = useRouter();
  const { register, handleSubmit, setError, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  });
  const e = formState.errors;
  const pwValue = useWatch({ control, name: 'password' });

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Create your account</h1>
      <p className="text-muted mt-1 text-[14px]">One account for every college and university on ADMITRA.</p>
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(async (v) => {
          try {
            const s = await post<Session>('/auth/register', {
              fullName: v.fullName,
              email: v.email,
              password: v.password,
            });
            applySession(s);
            toast.success('Account created. Please check your e-mail to verify it.');
            router.replace('/applicant/dashboard');
          } catch (err) {
            handleFormError(err, setError);
          }
        })}
      >
        <Field label="Full name" htmlFor="fullName" error={e.fullName?.message} hint="As written on your CNIC / B-Form">
          <Input
            placeholder="As written on your CNIC"
            id="fullName"
            autoComplete="name"
            aria-invalid={!!e.fullName}
            {...register('fullName')}
          />
        </Field>
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
            placeholder="At least 8 characters"
            id="password"
            autoComplete="new-password"
            aria-invalid={!!e.password}
            {...register('password')}
          />
        </Field>
        <PasswordChecklist value={pwValue ?? ''} />
        <Field label="Confirm password" htmlFor="confirm" error={e.confirm?.message}>
          <PasswordInput
            placeholder="Type the password again"
            id="confirm"
            autoComplete="new-password"
            aria-invalid={!!e.confirm}
            {...register('confirm')}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="text-muted mt-6 text-center text-[13.5px]">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-semibold hover:underline">
          Log in
        </Link>
      </p>
      <p className="text-muted mt-3 text-center text-[12.5px]">
        Staff accounts are created by invitation from your institution.
      </p>
    </>
  );
}
