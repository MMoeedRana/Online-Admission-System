'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { api, del, errorMessage, get, put } from '@/lib/api';
import { PROVINCES } from '@/lib/constants';
import { toDateInput } from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import { ProfileTabs } from './profile-tabs';
import type { Profile } from './types';

const phone = z
  .string()
  .trim()
  .regex(/^(\+92|0)?3\d{2}-?\d{7}$|^(\+92|0)\d{2,3}-?\d{6,8}$/, 'Enter a valid Pakistani phone number.');
const address = z.object({
  line: z.string().trim().min(3, 'Enter the address.'),
  city: z.string().trim().min(2, 'Enter the city.'),
  province: z.enum(PROVINCES, { message: 'Select the province.' }),
});
const schema = z.object({
  cnic: z
    .string()
    .trim()
    .transform((v) => v.replace(/-/g, ''))
    .pipe(z.string().regex(/^\d{13}$/, 'CNIC / B-Form must have 13 digits.')),
  fullName: z.string().trim().min(3, 'Enter your full name.'),
  fatherName: z.string().trim().min(3, "Enter your father's name."),
  dateOfBirth: z.string().min(1, 'Enter your date of birth.'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone,
  nationality: z.string().trim().min(3),
  domicile: z.string().trim().min(2, 'Enter your domicile district.'),
  religion: z.string().trim(),
  guardian: z.object({
    name: z.string().trim().min(3, "Enter the guardian's name."),
    relation: z.string().trim().min(2, 'Enter the relation.'),
    phone,
    occupation: z.string().trim(),
  }),
  permanentAddress: address,
  currentAddress: address,
});
type Values = z.input<typeof schema>;

const formatCnic = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 13);
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join('-');
};

export function ProfilePage() {
  const q = useQuery({ queryKey: ['me', 'profile'], queryFn: () => get<Profile | null>('/me/profile') });
  if (q.isPending) return <FullPageLoader />;
  return <ProfileForm profile={q.data ?? null} />;
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [same, setSame] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const empty = { line: '', city: '', province: 'Punjab' as const };
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: profile
      ? ({
          ...profile,
          cnic: formatCnic(profile.cnic),
          dateOfBirth: toDateInput(profile.dateOfBirth),
          religion: profile.religion ?? '',
          guardian: { ...profile.guardian, occupation: profile.guardian.occupation ?? '' },
        } as Values)
      : {
          cnic: '',
          fullName: user?.fullName ?? '',
          fatherName: '',
          dateOfBirth: '',
          gender: 'MALE',
          phone: '',
          nationality: 'Pakistani',
          domicile: '',
          religion: '',
          guardian: { name: '', relation: 'Father', phone: '', occupation: '' },
          permanentAddress: empty,
          currentAddress: empty,
        },
  });
  const { register, handleSubmit, setError, setValue, control, formState } = form;
  const e = formState.errors;
  const permanent = useWatch({ control, name: 'permanentAddress' });

  const save = handleSubmit(async (v) => {
    if (same) v.currentAddress = v.permanentAddress;
    try {
      await put('/me/profile', v);
      toast.success('Profile saved.');
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  const exportData = async () => {
    try {
      const r = await api.get('/me/profile/export', { responseType: 'blob' });
      const href = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'admitra-my-data.json';
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const addr = (prefix: 'permanentAddress' | 'currentAddress') => (
    <>
      <Field
        label="Address"
        htmlFor={`${prefix}-line`}
        required
        error={e[prefix]?.line?.message}
        className="sm:col-span-2"
      >
        <Input placeholder="House no., street, area" id={`${prefix}-line`} {...register(`${prefix}.line`)} />
      </Field>
      <Field label="City" htmlFor={`${prefix}-city`} required error={e[prefix]?.city?.message}>
        <Input placeholder="e.g. Faisalabad" id={`${prefix}-city`} {...register(`${prefix}.city`)} />
      </Field>
      <Field label="Province" htmlFor={`${prefix}-prov`} required error={e[prefix]?.province?.message}>
        <Select id={`${prefix}-prov`} {...register(`${prefix}.province`)}>
          {PROVINCES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </Field>
    </>
  );

  return (
    <>
      <PageHeader
        title="Profile & Marks"
        subtitle="Enter your details once and use them in every application (PROF-1)"
      />
      <ProfileTabs active="profile" />
      <form noValidate onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader
            title="Personal information"
            subtitle="As written on your CNIC / B-Form. Name, father's name and CNIC cannot be changed after you submit an application."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full name" htmlFor="fullName" required error={e.fullName?.message}>
              <Input placeholder="As written on your CNIC" id="fullName" {...register('fullName')} />
            </Field>
            <Field label="Father's name" htmlFor="fatherName" required error={e.fatherName?.message}>
              <Input placeholder="Your father's full name" id="fatherName" {...register('fatherName')} />
            </Field>
            <Field
              label="CNIC / B-Form number"
              htmlFor="cnic"
              required
              error={e.cnic?.message}
              hint="13 digits, e.g. 35202-1234567-1"
            >
              <Input
                placeholder="35202-1234567-1"
                id="cnic"
                inputMode="numeric"
                {...register('cnic', { onChange: (ev) => setValue('cnic', formatCnic(ev.target.value)) })}
              />
            </Field>
            <Field label="Date of birth" htmlFor="dob" required error={e.dateOfBirth?.message}>
              <Input placeholder="DD/MM/YYYY" id="dob" type="date" {...register('dateOfBirth')} />
            </Field>
            <Field label="Gender" htmlFor="gender" required>
              <Select id="gender" {...register('gender')}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Mobile number" htmlFor="phone" required error={e.phone?.message}>
              <Input id="phone" inputMode="tel" placeholder="0300-1234567" {...register('phone')} />
            </Field>
            <Field label="Nationality" htmlFor="nationality" required>
              <Input placeholder="e.g. Pakistani" id="nationality" {...register('nationality')} />
            </Field>
            <Field label="Domicile (district)" htmlFor="domicile" required error={e.domicile?.message}>
              <Input placeholder="e.g. Faisalabad" id="domicile" {...register('domicile')} />
            </Field>
            <Field label="Religion" htmlFor="religion">
              <Input placeholder="e.g. Islam" id="religion" {...register('religion')} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Guardian" />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name" htmlFor="g-name" required error={e.guardian?.name?.message}>
              <Input placeholder="Guardian's full name" id="g-name" {...register('guardian.name')} />
            </Field>
            <Field label="Relation" htmlFor="g-rel" required error={e.guardian?.relation?.message}>
              <Input placeholder="e.g. Father" id="g-rel" {...register('guardian.relation')} />
            </Field>
            <Field label="Mobile number" htmlFor="g-phone" required error={e.guardian?.phone?.message}>
              <Input placeholder="03XX-XXXXXXX" id="g-phone" inputMode="tel" {...register('guardian.phone')} />
            </Field>
            <Field label="Occupation" htmlFor="g-occ">
              <Input placeholder="e.g. Businessman" id="g-occ" {...register('guardian.occupation')} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Address" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <p className="text-ink text-[13px] font-semibold sm:col-span-2">Permanent address</p>
            {addr('permanentAddress')}
            <Checkbox
              className="sm:col-span-2"
              label="Current address is the same as the permanent address"
              checked={same}
              onChange={(ev) => {
                setSame(ev.target.checked);
                if (ev.target.checked) setValue('currentAddress', permanent);
              }}
            />
            {!same && (
              <>
                <p className="text-ink text-[13px] font-semibold sm:col-span-2">Current address</p>
                {addr('currentAddress')}
              </>
            )}
          </CardBody>
        </Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => void exportData()}>
              Download my data
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4 text-red-700 dark:text-red-400" />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete account
            </Button>
          </div>
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Save profile
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account"
        message="Your profile, academic records, drafts and uploaded files will be deleted permanently. This is possible only while you have no submitted application (PROF-5)."
        confirmLabel="Delete my account"
        onConfirm={async () => {
          try {
            await del('/me/profile/account');
            toast.success('Your account was deleted.');
            await logout();
          } catch (err) {
            toast.error(errorMessage(err));
            setConfirmDelete(false);
          }
        }}
      />
    </>
  );
}
