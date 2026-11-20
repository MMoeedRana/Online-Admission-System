'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { get, getPaged, post } from '@/lib/api';
import { INSTITUTION_TYPES, PROVINCES, SECTORS } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import type { Institution, Plan } from '@/lib/types';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

export function InstitutionsList() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<string>(sp.get('status') ?? '');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['platform', 'institutions', status, q, page],
    queryFn: () =>
      getPaged<Institution>('/platform/institutions', { status: status || undefined, q: q || undefined, page }),
  });

  return (
    <>
      <PageHeader
        title="Institutions"
        subtitle="Onboarding requests, subscriptions and status of every institution"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Add institution
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={STATUS_TABS.map((t) => ({ value: t.value as string, label: t.label }))}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Input
          placeholder="Search by name or city"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search institutions"
        />
      </div>
      <Card className="overflow-hidden">
        <DataTable
          loading={list.isPending}
          rows={list.data?.data ?? []}
          rowKey={(r) => r._id}
          onRowClick={(r) => router.push(`/platform/institutions/${r._id}`)}
          empty={
            <EmptyState
              icon={Building2}
              title="No institutions found"
              text="Change the filter or add an institution."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Institution',
              primary: true,
              cell: (r) => (
                <div>
                  <p className="text-ink font-semibold">{r.name}</p>
                  <p className="text-muted text-[12px]">
                    {INSTITUTION_TYPES[r.type]} · {SECTORS[r.sector]}
                  </p>
                </div>
              ),
            },
            { key: 'city', header: 'City', cell: (r) => `${r.city}` },
            {
              key: 'plan',
              header: 'Plan',
              cell: (r) => (typeof r.planId === 'object' && r.planId ? r.planId.name : '-'),
            },
            { key: 'ends', header: 'Subscription ends', cell: (r) => formatDate(r.subscription?.endsAt) },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} className="border-line border-t" />
      </Card>
      <CreateInstitutionModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const phone = z.union([
  z.literal(''),
  z.string().regex(/^(\+92|0)?3\d{2}-?\d{7}$|^(\+92|0)\d{2,3}-?\d{6,8}$/, 'Enter a valid Pakistani phone number.'),
]);
const createSchema = z.object({
  name: z.string().trim().min(3, 'Enter the name.'),
  shortName: z.string().trim().min(2).max(10),
  type: z.enum(['UNIVERSITY', 'COLLEGE', 'INSTITUTE']),
  sector: z.enum(['PUBLIC', 'PRIVATE']),
  city: z.string().trim().min(2, 'Enter the city.'),
  province: z.enum(PROVINCES),
  website: z.union([z.literal(''), z.string().url('Enter a full URL.')]),
  contact: z.object({
    name: z.string().trim().min(3, 'Enter the name.'),
    designation: z.string().trim(),
    email: z.string().email('Enter a valid e-mail.'),
    phone,
  }),
  planId: z.string().min(1, 'Select a plan.'),
  trialDays: z.coerce.number().int().min(0).max(365),
});
type CreateValues = z.input<typeof createSchema>;

export function usePlans() {
  return useQuery({ queryKey: ['platform', 'plans'], queryFn: () => get<Plan[]>('/platform/plans') });
}

function CreateInstitutionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const plans = usePlans();
  const { register, handleSubmit, setError, reset, formState } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      type: 'UNIVERSITY',
      sector: 'PRIVATE',
      province: 'Punjab',
      website: '',
      trialDays: 30,
      contact: { designation: '', phone: '' },
    },
  });
  const e = formState.errors;
  const submit = handleSubmit(async (v) => {
    try {
      await post('/platform/institutions', v);
      toast.success('Institution created and the admin invitation was sent.');
      qc.invalidateQueries({ queryKey: ['platform'] });
      reset();
      onClose();
    } catch (err) {
      handleFormError(err, setError);
    }
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add institution"
      description="The institution is activated with the selected plan and its contact person is invited as Institution Admin."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={formState.isSubmitting} onClick={submit}>
            Create and invite
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="ci-name" required error={e.name?.message} className="sm:col-span-2">
          <Input placeholder="e.g. Riphah Institute of Technology" id="ci-name" {...register('name')} />
        </Field>
        <Field label="Short name" htmlFor="ci-short" required error={e.shortName?.message}>
          <Input placeholder="e.g. RIT" id="ci-short" {...register('shortName')} />
        </Field>
        <Field label="Website" htmlFor="ci-web" error={e.website?.message}>
          <Input id="ci-web" placeholder="https://" {...register('website')} />
        </Field>
        <Field label="Type" htmlFor="ci-type">
          <Select id="ci-type" {...register('type')}>
            {Object.entries(INSTITUTION_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sector" htmlFor="ci-sector">
          <Select id="ci-sector" {...register('sector')}>
            {Object.entries(SECTORS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="ci-city" required error={e.city?.message}>
          <Input placeholder="e.g. Lahore" id="ci-city" {...register('city')} />
        </Field>
        <Field label="Province" htmlFor="ci-prov">
          <Select id="ci-prov" {...register('province')}>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contact person" htmlFor="ci-cn" required error={e.contact?.name?.message}>
          <Input placeholder="Full name of the contact" id="ci-cn" {...register('contact.name')} />
        </Field>
        <Field label="Designation" htmlFor="ci-cd">
          <Input placeholder="e.g. Registrar" id="ci-cd" {...register('contact.designation')} />
        </Field>
        <Field label="Contact e-mail" htmlFor="ci-ce" required error={e.contact?.email?.message}>
          <Input placeholder="name@institution.edu.pk" id="ci-ce" type="email" {...register('contact.email')} />
        </Field>
        <Field label="Contact phone" htmlFor="ci-cp" error={e.contact?.phone?.message}>
          <Input placeholder="03XX-XXXXXXX" id="ci-cp" {...register('contact.phone')} />
        </Field>
        <Field label="Plan" htmlFor="ci-plan" required error={e.planId?.message}>
          <Select id="ci-plan" {...register('planId')} defaultValue="">
            <option value="" disabled>
              Select a plan
            </option>
            {plans.data
              ?.filter((p) => p.status === 'ACTIVE')
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Trial days" htmlFor="ci-trial" error={e.trialDays?.message}>
          <Input placeholder="e.g. 30" id="ci-trial" type="number" min={0} {...register('trialDays')} />
        </Field>
      </form>
    </Modal>
  );
}

export function useInstitutionAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) =>
      post<Institution>(`/platform/institutions/${id}/${action}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
  });
}
