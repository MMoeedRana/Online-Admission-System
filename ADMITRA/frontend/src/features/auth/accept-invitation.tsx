'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { errorMessage, fieldErrors, get, post } from '@/lib/api';
import { STAFF_ROLES } from '@/lib/constants';
import type { Session } from '@/lib/types';
import { useAuth } from './auth-context';
import { PasswordChecklist, PasswordInput, passwordRules } from './password-input';

interface Preview {
  email: string;
  fullName: string;
  roles: (keyof typeof STAFF_ROLES)[];
  institutionName: string;
  existingAccount: boolean;
}

export function AcceptInvitation() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { applySession } = useAuth();
  const q = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => get<Preview>('/auth/invitation', { token }),
    retry: false,
  });
  const [nameInput, setFullName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (q.isPending) return <FullPageLoader />;
  if (q.isError) {
    return (
      <div className="text-center">
        <XCircle className="mx-auto size-14 text-red-700 dark:text-red-400" />
        <h1 className="mt-4 text-[24px] font-bold">Invitation not valid</h1>
        <p className="text-muted mt-2 text-[14px]">
          {errorMessage(q.error)} Ask your institution admin to send a new invitation.
        </p>
        <ButtonLink href="/login" variant="secondary" className="mt-6">
          Go to log in
        </ButtonLink>
      </div>
    );
  }
  const inv = q.data;
  const fullName = nameInput ?? inv.fullName ?? '';
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!inv.existingAccount) {
      if (fullName.trim().length < 3) errs.fullName = 'Enter your full name.';
      if (!passwordRules.every((r) => r.test(password))) errs.password = 'The password does not meet the rules.';
      if (password !== confirm) errs.confirm = 'Passwords do not match.';
    } else if (!password) errs.password = 'Enter your password.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const s = await post<Session>('/auth/accept-invitation', {
        token,
        password,
        ...(inv.existingAccount ? {} : { fullName: fullName.trim() }),
      });
      applySession(s);
      toast.success(`Welcome to ${inv.institutionName}.`);
      router.replace('/institution/dashboard');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span className="bg-primary-soft text-primary flex size-12 items-center justify-center rounded-xl">
        <Building2 className="size-6" />
      </span>
      <h1 className="mt-4 text-[26px] font-bold tracking-tight">Join {inv.institutionName}</h1>
      <p className="text-muted mt-1 text-[14px]">
        You are invited as <b className="text-ink">{inv.email}</b> with the role(s):
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {inv.roles.map((r) => (
          <Badge key={r} tone="blue">
            {STAFF_ROLES[r]}
          </Badge>
        ))}
      </div>
      <form
        noValidate
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {inv.existingAccount ? (
          <Field
            label="Your ADMITRA password"
            htmlFor="password"
            error={errors.password}
            hint="You already have an ADMITRA account with this e-mail."
          >
            <PasswordInput
              placeholder="Your ADMITRA password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
              <Input
                placeholder="Your full name"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </Field>
            <Field label="Choose a password" htmlFor="password" error={errors.password}>
              <PasswordInput
                placeholder="At least 8 characters"
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <PasswordChecklist value={password} />
            <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
              <PasswordInput
                placeholder="Type the password again"
                id="confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Accept invitation
        </Button>
      </form>
    </>
  );
}
