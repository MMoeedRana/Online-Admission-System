'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { del, errorMessage, patch, post } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { handleFormError } from '@/lib/forms';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuth } from './auth-context';
import { PasswordChecklist, PasswordInput } from './password-input';
import { fullName, password } from './schemas';
import { useBrand } from '@/features/branding/brand-context';
import { ImageField } from '@/features/branding/brand-fields';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: password,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });
type PasswordValues = z.infer<typeof passwordSchema>;

export function AccountSettings() {
  const brand = useBrand();
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const profile = useForm<{ fullName: string }>({
    resolver: zodResolver(z.object({ fullName })),
    values: { fullName: user?.fullName ?? '' },
  });
  const pw = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { newPassword: '' } });
  const newPw = useWatch({ control: pw.control, name: 'newPassword' });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Account settings" subtitle="Your name, password and display preferences." />
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Profile picture"
            subtitle="Shown next to your name; without a picture your initials are shown."
          />
          <CardBody>
            <ImageField
              label="Profile picture"
              hint="PNG, JPG or WebP up to 2 MB. A square photo works best."
              url={user.avatarUrl ?? ''}
              uploadUrl="/auth/me/avatar"
              rounded="rounded-full"
              onDone={(d) => updateUser((d as { user: User }).user)}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <form
              noValidate
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={profile.handleSubmit(async (v) => {
                try {
                  const r = await patch<{ user: User }>('/auth/me', v);
                  updateUser(r.user);
                  toast.success('Profile updated.');
                } catch (err) {
                  handleFormError(err, profile.setError);
                }
              })}
            >
              <Field label="Full name" htmlFor="fullName" error={profile.formState.errors.fullName?.message}>
                <Input placeholder="Your full name" id="fullName" {...profile.register('fullName')} />
              </Field>
              <Field label="E-mail" htmlFor="email" hint="The e-mail address cannot be changed.">
                <div className="flex items-center gap-2">
                  <Input placeholder="you@example.com" id="email" value={user.email} disabled />
                  {user.emailVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={profile.formState.isSubmitting}>
                  Save profile
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Theme" subtitle={`Choose how ${brand.platformName} looks on this device.`} />
          <CardBody className="flex gap-3">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTheme(t);
                  void patch('/auth/me', { theme: t }).catch(() => undefined);
                }}
                className={cn(
                  'flex-1 rounded-xl border p-4 text-left text-[14px] font-semibold capitalize',
                  theme === t ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink',
                )}
              >
                {t}
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Change password" subtitle="Other sessions stay signed in until they expire." />
          <CardBody>
            <form
              noValidate
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={pw.handleSubmit(async (v) => {
                try {
                  await post('/auth/change-password', {
                    currentPassword: v.currentPassword,
                    newPassword: v.newPassword,
                  });
                  pw.reset({ currentPassword: '', newPassword: '', confirm: '' });
                  toast.success('Password changed.');
                } catch (err) {
                  handleFormError(err, pw.setError);
                }
              })}
            >
              <Field
                label="Current password"
                htmlFor="currentPassword"
                error={pw.formState.errors.currentPassword?.message}
                className="sm:col-span-2"
              >
                <PasswordInput
                  placeholder="Your current password"
                  id="currentPassword"
                  autoComplete="current-password"
                  {...pw.register('currentPassword')}
                />
              </Field>
              <Field label="New password" htmlFor="newPassword" error={pw.formState.errors.newPassword?.message}>
                <PasswordInput
                  placeholder="At least 8 characters"
                  id="newPassword"
                  autoComplete="new-password"
                  {...pw.register('newPassword')}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm" error={pw.formState.errors.confirm?.message}>
                <PasswordInput
                  placeholder="Type the new password again"
                  id="confirm"
                  autoComplete="new-password"
                  {...pw.register('confirm')}
                />
              </Field>
              <div className="sm:col-span-2">
                <PasswordChecklist value={newPw ?? ''} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" loading={pw.formState.isSubmitting}>
                  Change password
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
        {user.accountType === 'APPLICANT' && <YourData />}
      </div>
    </div>
  );
}

function YourData() {
  const brand = useBrand();
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Your data"
        subtitle={`Download everything ${brand.platformName} keeps about you, or delete your account.`}
      />
      <CardBody className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          icon={<Download className="size-4" />}
          onClick={() => void downloadFile('/me/profile/export', 'admitra-my-data.json')}
        >
          Download my data
        </Button>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
          Delete account
        </Button>
        <p className="text-muted w-full text-[12.5px]">
          An account can be deleted only while none of its applications has been submitted.
        </p>
      </CardBody>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete account"
        message="Your profile, marks, drafts and uploaded files will be deleted permanently."
        confirmLabel="Delete account"
        onConfirm={async () => {
          try {
            await del('/me/profile/account');
            toast.success('Your account has been deleted.');
            await logout();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </Card>
  );
}
