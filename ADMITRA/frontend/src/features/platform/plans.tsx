'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { patch, post } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import type { Plan } from '@/lib/types';
import { usePlans } from './institutions';

const FEATURES = [
  ['multipleCampuses', 'Multiple campuses'],
  ['customBranding', 'Custom branding'],
  ['advancedAnalytics', 'Advanced analytics'],
  ['apiAccess', 'API access'],
  ['aiBriefing', 'Daily AI briefing'],
  ['aiCopilot', 'AI copilot (chat and actions)'],
] as const;

const num = z.coerce.number().int().min(1, 'At least 1');
const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - or _'),
  name: z.string().trim().min(2, 'Enter a name.'),
  description: z.string().trim().max(300),
  priceMonthly: z.coerce.number().min(0),
  trialDays: z.coerce.number().int().min(0).max(365),
  limits: z.object({ campuses: num, programs: num, staff: num, applicationsPerCycle: num }),
  features: z.object({
    multipleCampuses: z.boolean(),
    customBranding: z.boolean(),
    advancedAnalytics: z.boolean(),
    apiAccess: z.boolean(),
    aiBriefing: z.boolean(),
    aiCopilot: z.boolean(),
  }),
  status: z.enum(['ACTIVE', 'RETIRED']),
});
type Values = z.input<typeof schema>;

export function PlansPage() {
  const plans = usePlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  if (!plans.data) return <FullPageLoader />;
  return (
    <>
      <PageHeader
        title="Subscription plans"
        subtitle="Limits and features that apply to each institution (INST-3)"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            New plan
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.data.map((p) => (
          <Card key={p._id} className="flex flex-col p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-muted text-[12px] font-bold tracking-wider uppercase">{p.code}</p>
                <h2 className="mt-1 text-[19px] font-bold">{p.name}</h2>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-ink mt-3 text-[26px] font-extrabold">
              {formatMoney(p.priceMonthly)}
              <span className="text-muted text-[13px] font-medium"> / month</span>
            </p>
            {p.description && <p className="text-muted mt-1 text-[13px]">{p.description}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
              {[
                ['Campuses', p.features.multipleCampuses ? p.limits.campuses : 1],
                ['Programs', p.limits.programs],
                ['Staff', p.limits.staff],
                ['Applications / cycle', p.limits.applicationsPerCycle],
              ].map(([l, v]) => (
                <div key={String(l)} className="bg-card-soft rounded-xl p-3">
                  <dt className="text-muted text-[11.5px]">{l}</dt>
                  <dd className="text-ink text-[15px] font-bold">{formatNumber(Number(v))}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-4 space-y-1.5 text-[13px]">
              {FEATURES.map(([k, l]) => (
                <li key={k} className="flex items-center gap-2">
                  {p.features[k] ? (
                    <Check className="size-4 text-green-700 dark:text-green-400" />
                  ) : (
                    <X className="text-muted size-4" />
                  )}
                  <span className={p.features[k] ? 'text-ink' : 'text-muted'}>{l}</span>
                </li>
              ))}
            </ul>
            <div className="border-line text-muted mt-auto flex items-center justify-between border-t pt-4 text-[13px]">
              <span>
                {p.institutions ?? 0} institution(s) · {p.trialDays}-day trial
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Pencil className="size-3.5" />}
                onClick={() => setEditing(p)}
              >
                Edit
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: plan ?? {
      code: '',
      name: '',
      description: '',
      priceMonthly: 0,
      trialDays: 30,
      limits: { campuses: 1, programs: 20, staff: 10, applicationsPerCycle: 2000 },
      features: {
        multipleCampuses: false,
        customBranding: false,
        advancedAnalytics: false,
        apiAccess: false,
        aiBriefing: false,
        aiCopilot: false,
      },
      status: 'ACTIVE',
    },
  });
  const e = formState.errors;
  const submit = handleSubmit(async (v) => {
    try {
      if (plan) await patch(`/platform/plans/${plan._id}`, v);
      else await post('/platform/plans', v);
      toast.success(plan ? 'Plan updated.' : 'Plan created.');
      qc.invalidateQueries({ queryKey: ['platform'] });
      onClose();
    } catch (err) {
      handleFormError(err, setError);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={formState.isSubmitting} onClick={submit}>
            Save plan
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Code" htmlFor="pl-code" required error={e.code?.message}>
          <Input placeholder="e.g. STANDARD" id="pl-code" disabled={Boolean(plan)} {...register('code')} />
        </Field>
        <Field label="Name" htmlFor="pl-name" required error={e.name?.message}>
          <Input placeholder="e.g. Standard" id="pl-name" {...register('name')} />
        </Field>
        <Field label="Price per month (Rs.)" htmlFor="pl-price" error={e.priceMonthly?.message}>
          <Input placeholder="e.g. 25000" id="pl-price" type="number" min={0} {...register('priceMonthly')} />
        </Field>
        <Field label="Trial days" htmlFor="pl-trial" error={e.trialDays?.message}>
          <Input placeholder="e.g. 30" id="pl-trial" type="number" min={0} {...register('trialDays')} />
        </Field>
        <Field label="Campuses" htmlFor="pl-c" error={e.limits?.campuses?.message}>
          <Input placeholder="e.g. 3" id="pl-c" type="number" min={1} {...register('limits.campuses')} />
        </Field>
        <Field label="Programs" htmlFor="pl-p" error={e.limits?.programs?.message}>
          <Input placeholder="e.g. 50" id="pl-p" type="number" min={1} {...register('limits.programs')} />
        </Field>
        <Field label="Staff" htmlFor="pl-s" error={e.limits?.staff?.message}>
          <Input placeholder="e.g. 25" id="pl-s" type="number" min={1} {...register('limits.staff')} />
        </Field>
        <Field label="Applications per cycle" htmlFor="pl-a" error={e.limits?.applicationsPerCycle?.message}>
          <Input placeholder="e.g. 5000" id="pl-a" type="number" min={1} {...register('limits.applicationsPerCycle')} />
        </Field>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          {FEATURES.map(([k, l]) => (
            <Checkbox key={k} label={l} {...register(`features.${k}`)} />
          ))}
        </div>
        <Field label="Description" htmlFor="pl-desc" className="sm:col-span-2">
          <Textarea placeholder="What this plan offers" id="pl-desc" {...register('description')} />
        </Field>
        <Field label="Status" htmlFor="pl-status">
          <Select id="pl-status" {...register('status')}>
            <option value="ACTIVE">Active</option>
            <option value="RETIRED">Retired (not offered to new institutions)</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
