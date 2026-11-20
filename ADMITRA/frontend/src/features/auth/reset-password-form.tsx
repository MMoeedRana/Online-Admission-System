'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { post } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { PasswordChecklist, PasswordInput } from './password-input';
import { password } from './schemas';

const schema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { register, handleSubmit, setError, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  });
  const e = formState.errors;
  const pwValue = useWatch({ control, name: 'password' });
  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">Set a new password</h1>
      <p className="text-muted mt-1 text-[14px]">For your security all other sessions will be signed out.</p>
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(async (v) => {
          try {
            await post('/auth/reset-password', { token, password: v.password });
            toast.success('Password changed. Please log in with the new password.');
            router.replace('/login');
          } catch (err) {
            handleFormError(err, setError);
          }
        })}
      >
        <Field label="New password" htmlFor="password" error={e.password?.message}>
          <PasswordInput
            placeholder="At least 8 characters"
            id="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </Field>
        <PasswordChecklist value={pwValue ?? ''} />
        <Field label="Confirm password" htmlFor="confirm" error={e.confirm?.message}>
          <PasswordInput
            placeholder="Type the new password again"
            id="confirm"
            autoComplete="new-password"
            {...register('confirm')}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          Save new password
        </Button>
      </form>
    </>
  );
}
