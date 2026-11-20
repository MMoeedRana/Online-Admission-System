'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { post } from '@/lib/api';
import { INSTITUTION_TYPES, PROVINCES, SECTORS } from '@/lib/constants';
import { handleFormError } from '@/lib/forms';

const phone = z
  .string()
  .trim()
  .regex(/^(\+92|0)?3\d{2}-?\d{7}$|^(\+92|0)\d{2,3}-?\d{6,8}$/, 'Enter a valid Pakistani phone number.');

const schema = z.object({
  name: z.string().trim().min(3, 'Enter the institution name.'),
  shortName: z.string().trim().min(2, 'At least 2 letters.').max(10, 'At most 10 letters.'),
  type: z.enum(['UNIVERSITY', 'COLLEGE', 'INSTITUTE']),
  sector: z.enum(['PUBLIC', 'PRIVATE']),
  city: z.string().trim().min(2, 'Enter the city.'),
  province: z.enum(PROVINCES),
  website: z.union([z.literal(''), z.string().trim().url('Enter a full URL starting with https://')]),
  message: z.string().trim().max(1000),
  contact: z.object({
    name: z.string().trim().min(3, 'Enter the contact person name.'),
    designation: z.string().trim().min(2, 'Enter the designation.'),
    email: z.string().trim().email('Enter a valid e-mail address.'),
    phone,
  }),
});
type Values = z.infer<typeof schema>;

export function OnboardingForm() {
  const [done, setDone] = useState(false);
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'UNIVERSITY', sector: 'PRIVATE', province: 'Punjab', website: '', message: '' },
  });
  const e = formState.errors;

  if (done) {
    return (
      <Card className="mt-6 flex flex-col items-center p-10 text-center">
        <CheckCircle2 className="size-14 text-green-700 dark:text-green-400" />
        <h2 className="mt-4 text-[20px] font-bold">Request received</h2>
        <p className="text-muted mt-2 max-w-md text-[14px]">
          Thank you. We sent a confirmation to your e-mail. Our team will review the request and contact you soon.
        </p>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          Back to home
        </ButtonLink>
      </Card>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (v) => {
        try {
          await post('/public/onboarding-requests', v);
          setDone(true);
        } catch (err) {
          handleFormError(err, setError);
        }
      })}
      className="mt-6 space-y-6"
    >
      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-bold">Institution</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Institution name" htmlFor="name" required error={e.name?.message} className="sm:col-span-2">
            <Input
              placeholder="e.g. Government College University"
              id="name"
              aria-invalid={!!e.name}
              {...register('name')}
            />
          </Field>
          <Field label="Short name" htmlFor="shortName" required error={e.shortName?.message} hint="For example GCUF">
            <Input placeholder="e.g. GCUF" id="shortName" aria-invalid={!!e.shortName} {...register('shortName')} />
          </Field>
          <Field label="Type" htmlFor="type" required>
            <Select id="type" {...register('type')}>
              {Object.entries(INSTITUTION_TYPES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sector" htmlFor="sector" required>
            <Select id="sector" {...register('sector')}>
              {Object.entries(SECTORS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Website" htmlFor="website" error={e.website?.message}>
            <Input id="website" placeholder="https://" aria-invalid={!!e.website} {...register('website')} />
          </Field>
          <Field label="City" htmlFor="city" required error={e.city?.message}>
            <Input placeholder="e.g. Faisalabad" id="city" aria-invalid={!!e.city} {...register('city')} />
          </Field>
          <Field label="Province" htmlFor="province" required>
            <Select id="province" {...register('province')}>
              {PROVINCES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="text-[15px] font-bold">Contact person</h2>
        <p className="text-muted mt-1 text-[12.5px]">
          This person receives the invitation to become the Institution Admin.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="cname" required error={e.contact?.name?.message}>
            <Input
              placeholder="Full name of the contact"
              id="cname"
              aria-invalid={!!e.contact?.name}
              {...register('contact.name')}
            />
          </Field>
          <Field label="Designation" htmlFor="cdes" required error={e.contact?.designation?.message}>
            <Input
              id="cdes"
              placeholder="Registrar, Director Admissions..."
              aria-invalid={!!e.contact?.designation}
              {...register('contact.designation')}
            />
          </Field>
          <Field label="Official e-mail" htmlFor="cemail" required error={e.contact?.email?.message}>
            <Input
              placeholder="name@institution.edu.pk"
              id="cemail"
              type="email"
              aria-invalid={!!e.contact?.email}
              {...register('contact.email')}
            />
          </Field>
          <Field
            label="Phone"
            htmlFor="cphone"
            required
            error={e.contact?.phone?.message}
            hint="For example 0300-1234567"
          >
            <Input
              placeholder="03XX-XXXXXXX"
              id="cphone"
              inputMode="tel"
              aria-invalid={!!e.contact?.phone}
              {...register('contact.phone')}
            />
          </Field>
          <Field label="Message (optional)" htmlFor="message" className="sm:col-span-2">
            <Textarea placeholder="Tell us about your admissions (optional)" id="message" {...register('message')} />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Send request
        </Button>
      </div>
    </form>
  );
}
