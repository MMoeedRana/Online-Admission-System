'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { errorMessage, fieldErrors, get, patch } from '@/lib/api';
import { INSTITUTION_TYPES, SECTORS } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import type { Institution, Plan } from '@/lib/types';
import { useInstKey } from './hooks';

type Tab = 'profile' | 'bank' | 'branding' | 'workflow' | 'subscription';
interface Sub {
  plan: Plan;
  usage: { campuses: number; programs: number; staff: number };
  subscription: { startsAt: string; endsAt: string; isTrial: boolean };
  state: string;
}

export function SettingsPage() {
  const key = useInstKey();
  const inst = useQuery({ queryKey: key('profile'), queryFn: () => get<Institution>('/institution/profile') });
  if (!inst.data) return <FullPageLoader />;
  return <SettingsForm initial={inst.data} />;
}

function SettingsForm({ initial }: { initial: Institution }) {
  const key = useInstKey();
  const qc = useQueryClient();
  const sub = useQuery({ queryKey: key('subscription'), queryFn: () => get<Sub>('/institution/subscription') });
  const [tab, setTab] = useState<Tab>('profile');
  const [form, setForm] = useState<Institution>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: object) => patch<Institution>('/institution/profile', body),
    onSuccess: () => {
      toast.success('Settings saved.');
      setErrors({});
      qc.invalidateQueries({ queryKey: key() });
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    },
  });

  const i = form;
  const set = <K extends keyof Institution>(k: K, v: Institution[K]) => setForm((f) => ({ ...f, [k]: v }));
  const canBrand = sub.data?.plan.features.customBranding;

  return (
    <>
      <PageHeader
        title="Institution settings"
        subtitle={`${i.name} · ${INSTITUTION_TYPES[i.type]} · ${SECTORS[i.sector]} · ${i.city}`}
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'profile', label: 'Profile' },
          { value: 'bank', label: 'Bank account' },
          { value: 'branding', label: 'Branding' },
          { value: 'workflow', label: 'Workflow' },
          { value: 'subscription', label: 'Subscription' },
        ]}
      />

      {tab === 'profile' && (
        <Card>
          <CardHeader
            title="Public profile"
            subtitle="Shown on your institution page. The name is managed by ADMITRA support."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Website" htmlFor="s-web" error={errors.website}>
              <Input
                id="s-web"
                value={i.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="Public e-mail" htmlFor="s-email" error={errors.email}>
              <Input id="s-email" type="email" value={i.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="s-phone" error={errors.phone}>
              <Input id="s-phone" value={i.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Address" htmlFor="s-addr" error={errors.address}>
              <Input id="s-addr" value={i.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="About" htmlFor="s-about" className="sm:col-span-2">
              <Textarea id="s-about" rows={5} value={i.about} onChange={(e) => set('about', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Button
                loading={save.isPending}
                onClick={() =>
                  save.mutate({
                    website: i.website,
                    email: i.email,
                    phone: i.phone,
                    address: i.address,
                    about: i.about,
                  })
                }
              >
                Save profile
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'bank' && (
        <Card>
          <CardHeader
            title="Bank account for fee collection"
            subtitle="Printed on application and admission fee challans."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['bankName', 'Bank name'],
                ['accountTitle', 'Account title'],
                ['accountNumber', 'Account number'],
                ['iban', 'IBAN'],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l} htmlFor={`b-${k}`} error={errors[`bankAccount.${k}`]}>
                <Input
                  id={`b-${k}`}
                  value={i.bankAccount[k]}
                  onChange={(e) => set('bankAccount', { ...i.bankAccount, [k]: e.target.value })}
                />
              </Field>
            ))}
            <div className="sm:col-span-2">
              <Button loading={save.isPending} onClick={() => save.mutate({ bankAccount: i.bankAccount })}>
                Save bank account
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'branding' && (
        <Card>
          <CardHeader title="Branding" subtitle="Logo and accent color of your institution." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {!canBrand && (
              <Alert tone="info" className="sm:col-span-2">
                Custom branding is not included in your current plan.
              </Alert>
            )}
            <Field label="Logo URL" htmlFor="br-logo" error={errors['branding.logoUrl']}>
              <Input
                id="br-logo"
                disabled={!canBrand}
                value={i.branding.logoUrl}
                onChange={(e) => set('branding', { ...i.branding, logoUrl: e.target.value })}
                placeholder="https://"
              />
            </Field>
            <Field label="Accent color" htmlFor="br-color" error={errors['branding.primaryColor']}>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick color"
                  disabled={!canBrand}
                  value={i.branding.primaryColor}
                  onChange={(e) => set('branding', { ...i.branding, primaryColor: e.target.value.toUpperCase() })}
                  className="border-line bg-card h-11 w-14 cursor-pointer rounded-xl border p-1"
                />
                <Input
                  id="br-color"
                  disabled={!canBrand}
                  value={i.branding.primaryColor}
                  onChange={(e) => set('branding', { ...i.branding, primaryColor: e.target.value })}
                />
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Button
                disabled={!canBrand}
                loading={save.isPending}
                onClick={() => save.mutate({ branding: i.branding })}
              >
                Save branding
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'workflow' && (
        <Card>
          <CardHeader title="Application workflow" subtitle="FLOW-5: choose how applications are reviewed." />
          <CardBody className="space-y-4">
            <Checkbox
              label="Eligibility is a separate review step"
              description="When on, officers confirm eligibility in a separate step after document verification."
              checked={i.settings.eligibilityAsSeparateStep}
              onChange={(e) => set('settings', { eligibilityAsSeparateStep: e.target.checked })}
            />
            <Button loading={save.isPending} onClick={() => save.mutate({ settings: i.settings })}>
              Save workflow
            </Button>
          </CardBody>
        </Card>
      )}

      {tab === 'subscription' && sub.data && (
        <Card>
          <CardHeader
            title={`${sub.data.plan.name} plan`}
            subtitle={`${formatMoney(sub.data.plan.priceMonthly)} per month · renewals are handled by ADMITRA support`}
            action={<StatusBadge status={sub.data.state} />}
          />
          <CardBody className="space-y-5">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="bg-card-soft rounded-xl p-4">
                <dt className="text-muted text-[12px]">Started</dt>
                <dd className="text-ink font-semibold">{formatDate(sub.data.subscription.startsAt)}</dd>
              </div>
              <div className="bg-card-soft rounded-xl p-4">
                <dt className="text-muted text-[12px]">Ends</dt>
                <dd className="text-ink font-semibold">{formatDate(sub.data.subscription.endsAt)}</dd>
              </div>
              <div className="bg-card-soft rounded-xl p-4">
                <dt className="text-muted text-[12px]">Type</dt>
                <dd className="text-ink font-semibold">{sub.data.subscription.isTrial ? 'Trial' : 'Paid'}</dd>
              </div>
            </dl>
            <div className="space-y-3">
              {(
                [
                  [
                    'Campuses',
                    sub.data.usage.campuses,
                    sub.data.plan.features.multipleCampuses ? sub.data.plan.limits.campuses : 1,
                  ],
                  ['Active programs', sub.data.usage.programs, sub.data.plan.limits.programs],
                  ['Staff members', sub.data.usage.staff, sub.data.plan.limits.staff],
                ] as const
              ).map(([l, used, lim]) => (
                <div key={l}>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink font-semibold">{l}</span>
                    <span className="text-muted">
                      {used} of {lim}
                    </span>
                  </div>
                  <div className="bg-card-soft mt-1.5 h-2 rounded-full">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${Math.min(100, (used / lim) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
              {(
                [
                  ['multipleCampuses', 'Multiple campuses'],
                  ['customBranding', 'Custom branding'],
                  ['advancedAnalytics', 'Advanced analytics'],
                  ['apiAccess', 'API access'],
                ] as const
              ).map(([k, l]) => (
                <li key={k} className="flex items-center gap-2">
                  {sub.data.plan.features[k] ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <X className="text-muted size-4" />
                  )}
                  {l}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
