'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { del, errorMessage, get, getPaged, patch, post } from '@/lib/api';
import { CAMPAIGN_NEXT, DEGREE_LEVELS, TRUST_LEVELS } from '@/lib/constants';
import { formatDateTime, formatMoney, toLocalInput } from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import type { Campaign, Program } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useInstKey, useStructure } from './hooks';

const schema = z
  .object({
    title: z.string().trim().min(3, 'Enter a title such as Fall 2026.'),
    code: z
      .string()
      .trim()
      .min(2)
      .max(15)
      .regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and -'),
    sessionId: z.string().min(1, 'Select a session.'),
    opensAt: z.string().min(1, 'Select the opening time.'),
    closesAt: z.string().min(1, 'Select the closing time.'),
    programs: z.record(z.string(), z.object({ selected: z.boolean(), seatCap: z.string() })),
    settings: z.object({
      maxPreferences: z.coerce.number().int().min(1).max(10),
      duplicatePolicy: z.enum(['ONE_ACTIVE', 'ALLOW_MULTIPLE']),
      latePolicy: z.enum(['REFUSE', 'ALLOW']),
      feePolicy: z.enum(['HIGHEST', 'SUM']),
      minTrustLevel: z.coerce.number().int().min(0).max(3),
    }),
  })
  .refine((v) => new Date(v.closesAt) > new Date(v.opensAt), {
    message: 'Closing time must be after the opening time.',
    path: ['closesAt'],
  })
  .refine((v) => Object.values(v.programs).some((p) => p.selected), {
    message: 'Select at least one program.',
    path: ['programs'],
  });
type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

export function CampaignEditor({ id }: { id?: string }) {
  const key = useInstKey();
  const campaign = useQuery({
    queryKey: key('campaign', id),
    queryFn: () => get<Campaign>(`/campaigns/${id}`),
    enabled: Boolean(id),
  });
  const programs = useQuery({
    queryKey: key('programs', 'all-active'),
    queryFn: () => getPaged<Program>('/programs', { status: 'ACTIVE', limit: 100 }),
  });
  const structure = useStructure();
  if ((id && !campaign.data) || !programs.data || !structure.data) return <FullPageLoader />;
  return (
    <CampaignForm
      key={campaign.data?._id ?? 'new'}
      campaign={campaign.data}
      programs={programs.data.data}
      sessions={structure.data.sessions}
    />
  );
}

function CampaignForm({
  campaign,
  programs,
  sessions,
}: {
  campaign?: Campaign;
  programs: Program[];
  sessions: { _id: string; name: string; isCurrent: boolean }[];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const key = useInstKey();
  const { can } = useAuth();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const archived = campaign?.status === 'ARCHIVED';
  const editable = can('campaigns.manage') && !archived;

  const selectedIds = new Map(
    (campaign?.programs ?? []).map((p) => [typeof p.programId === 'object' ? p.programId._id : p.programId, p.seatCap]),
  );
  // Archived programs that are still part of the campaign are listed too.
  const extra = (campaign?.programs ?? [])
    .map((p) => p.programId)
    .filter((p): p is Program => typeof p === 'object' && !programs.some((x) => x._id === p._id));
  const allPrograms = [...programs, ...extra];

  const { register, handleSubmit, setError, control, formState } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: campaign?.title ?? '',
      code: campaign?.code ?? '',
      sessionId:
        (typeof campaign?.sessionId === 'object' ? campaign.sessionId._id : campaign?.sessionId) ??
        sessions.find((s) => s.isCurrent)?._id ??
        '',
      opensAt: toLocalInput(campaign?.opensAt ?? new Date(now)),
      closesAt: toLocalInput(campaign?.closesAt ?? new Date(now + 30 * 86_400_000)),
      programs: Object.fromEntries(
        allPrograms.map((p) => [
          p._id,
          { selected: selectedIds.has(p._id), seatCap: selectedIds.get(p._id)?.toString() ?? '' },
        ]),
      ),
      settings: campaign?.settings ?? {
        maxPreferences: 3,
        duplicatePolicy: 'ONE_ACTIVE',
        latePolicy: 'REFUSE',
        feePolicy: 'HIGHEST',
        minTrustLevel: 2,
      },
    },
  });
  const e = formState.errors;
  const chosen = useWatch({ control, name: 'programs' });
  const programsError = (e.programs as { message?: string } | undefined)?.message;

  const onSubmit = handleSubmit(async (v) => {
    const payload = {
      ...v,
      opensAt: new Date(v.opensAt).toISOString(),
      closesAt: new Date(v.closesAt).toISOString(),
      programs: Object.entries(v.programs)
        .filter(([, p]) => p.selected)
        .map(([programId, p]) => ({ programId, seatCap: p.seatCap ? Number(p.seatCap) : null })),
    };
    try {
      const saved = campaign
        ? await patch<Campaign>(`/campaigns/${campaign._id}`, payload)
        : await post<Campaign>('/campaigns', payload);
      toast.success(campaign ? 'Campaign saved.' : 'Campaign created as draft.');
      qc.invalidateQueries({ queryKey: key() });
      if (!campaign) router.replace(`/institution/campaigns/${saved._id}`);
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  const statusMut = useMutation({
    mutationFn: (to: string) => post<Campaign>(`/campaigns/${campaign!._id}/status`, { to }),
    onSuccess: (c) => {
      toast.success(`Campaign is now ${c.status.toLowerCase()}.`);
      qc.invalidateQueries({ queryKey: key() });
      setConfirm(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      setConfirm(null);
    },
  });
  const delMut = useMutation({
    mutationFn: () => del(`/campaigns/${campaign!._id}`),
    onSuccess: () => {
      toast.success('Draft campaign deleted.');
      qc.invalidateQueries({ queryKey: key() });
      router.replace('/institution/campaigns');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const next = campaign ? (CAMPAIGN_NEXT[campaign.status] ?? []) : [];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Campaigns', href: '/institution/campaigns' },
          { label: campaign ? campaign.code : 'New campaign' },
        ]}
        title={
          campaign ? (
            <span className="flex flex-wrap items-center gap-3">
              {campaign.title} <StatusBadge status={campaign.status} />
            </span>
          ) : (
            'New admission campaign'
          )
        }
        subtitle="CAMP-1: Draft, Open, Closed, then Open again or Archived"
        actions={
          campaign && can('campaigns.manage') ? (
            <>
              {next.map((n) => (
                <Button key={n.to} variant={n.to === 'OPEN' ? 'success' : 'secondary'} onClick={() => setConfirm(n.to)}>
                  {n.label}
                </Button>
              ))}
              {campaign.status === 'DRAFT' && (
                <Button
                  variant="secondary"
                  icon={<Trash2 className="size-4 text-red-600" />}
                  onClick={() => setConfirm('DELETE')}
                >
                  Delete
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      {archived && (
        <Alert tone="info" className="mb-6">
          This campaign is archived and can no longer be changed.
        </Alert>
      )}
      {sessions.length === 0 && (
        <Alert tone="warning" className="mb-6" title="No academic session">
          Add an academic session in Academic Structure before creating a campaign.
        </Alert>
      )}
      <form noValidate onSubmit={onSubmit} className="space-y-6">
        <fieldset disabled={!editable} className="space-y-6">
          <Card>
            <CardHeader title="Campaign" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Title" htmlFor="title" required error={e.title?.message}>
                <Input id="title" placeholder="Fall 2026" {...register('title')} />
              </Field>
              <Field
                label="Code"
                htmlFor="code"
                required
                error={e.code?.message}
                hint="Used in application numbers, e.g. F26"
              >
                <Input id="code" className="uppercase" {...register('code')} />
              </Field>
              <Field label="Academic session" htmlFor="sessionId" required error={e.sessionId?.message}>
                <Select id="sessionId" {...register('sessionId')}>
                  <option value="">Select session</option>
                  {sessions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                      {s.isCurrent ? ' (current)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Opens at" htmlFor="opensAt" required error={e.opensAt?.message}>
                <Input id="opensAt" type="datetime-local" {...register('opensAt')} />
              </Field>
              <Field label="Closes at" htmlFor="closesAt" required error={e.closesAt?.message}>
                <Input id="closesAt" type="datetime-local" {...register('closesAt')} />
              </Field>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Programs"
              subtitle="Select the programs that accept applications. A seat cap is optional and cannot exceed the program seats."
            />
            {programsError && <p className="px-6 pt-3 text-[12px] font-medium text-red-600">{programsError}</p>}
            <ul className="divide-line border-line mt-4 divide-y border-t">
              {allPrograms.length === 0 && (
                <li className="text-muted px-6 py-6 text-[13px]">There are no active programs. Add programs first.</li>
              )}
              {allPrograms.map((p) => {
                const seats = p.shifts.reduce((s, x) => s + x.seats, 0);
                const on = chosen?.[p._id]?.selected;
                return (
                  <li
                    key={p._id}
                    className={cn(
                      'grid gap-3 px-5 py-3.5 sm:grid-cols-[1fr_160px] sm:items-center sm:px-6',
                      on && 'bg-primary-soft/40',
                    )}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[var(--primary)]"
                        {...register(`programs.${p._id}.selected`)}
                      />
                      <span>
                        <span className="text-ink block font-semibold">
                          {p.title} <span className="text-muted text-[12px] font-medium">({p.code})</span>
                          {p.status === 'ARCHIVED' && <StatusBadge status="ARCHIVED" />}
                        </span>
                        <span className="text-muted block text-[12.5px]">
                          {DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS]} · {seats} seats · application fee{' '}
                          {formatMoney(p.applicationFee)}
                        </span>
                      </span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={seats}
                      placeholder={`Seat cap (max ${seats})`}
                      disabled={!on || !editable}
                      aria-label={`Seat cap for ${p.title}`}
                      {...register(`programs.${p._id}.seatCap`)}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Rules"
              subtitle="CAMP-2: preferences, duplicate and late applications, fee and marks verification policy"
            />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Maximum program preferences" htmlFor="maxPref" error={e.settings?.maxPreferences?.message}>
                <Input id="maxPref" type="number" min={1} max={10} {...register('settings.maxPreferences')} />
              </Field>
              <Field label="Duplicate applications" htmlFor="dup">
                <Select id="dup" {...register('settings.duplicatePolicy')}>
                  <option value="ONE_ACTIVE">One active application per applicant</option>
                  <option value="ALLOW_MULTIPLE">Allow more than one application</option>
                </Select>
              </Field>
              <Field label="Late applications" htmlFor="late">
                <Select id="late" {...register('settings.latePolicy')}>
                  <option value="REFUSE">Refuse after the closing time</option>
                  <option value="ALLOW">Allow started drafts to be submitted late</option>
                </Select>
              </Field>
              <Field label="Application fee policy" htmlFor="fee">
                <Select id="fee" {...register('settings.feePolicy')}>
                  <option value="HIGHEST">Highest fee among chosen programs</option>
                  <option value="SUM">Sum of fees of chosen programs</option>
                </Select>
              </Field>
              <Field
                label="Minimum marks trust level for merit"
                htmlFor="trust"
                hint="Records below this level are excluded from merit lists (MARK-10)"
              >
                <Select id="trust" {...register('settings.minTrustLevel')}>
                  {Object.entries(TRUST_LEVELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      Level {v}: {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>
        </fieldset>

        {editable && (
          <div className="border-line bg-card/95 sticky bottom-3 z-10 flex justify-end gap-2 rounded-2xl border p-3 shadow-[var(--shadow-pop)] backdrop-blur">
            <Button variant="secondary" onClick={() => router.push('/institution/campaigns')}>
              Cancel
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {campaign ? 'Save changes' : 'Create draft'}
            </Button>
          </div>
        )}
      </form>

      {campaign && campaign.history.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Status history" />
          <ul className="divide-line mt-3 divide-y">
            {[...campaign.history].reverse().map((h, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3 text-[13.5px] sm:px-6">
                <History className="text-muted size-4" />
                <StatusBadge status={h.from} /> → <StatusBadge status={h.to} />
                <span className="text-muted ml-auto text-[12.5px]">
                  {formatDateTime(h.at)}
                  {h.auto ? ' · automatic' : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(confirm && confirm !== 'DELETE')}
        onClose={() => setConfirm(null)}
        title={next.find((n) => n.to === confirm)?.label ?? ''}
        message={
          confirm === 'OPEN'
            ? 'The programs of this campaign become visible on the public website and applicants can apply until the closing time.'
            : confirm === 'CLOSED'
              ? 'New applications will be refused. You can re-open the campaign later.'
              : 'An archived campaign can no longer be opened or changed.'
        }
        confirmLabel={next.find((n) => n.to === confirm)?.label ?? 'Confirm'}
        variant={confirm === 'OPEN' ? 'success' : 'primary'}
        loading={statusMut.isPending}
        onConfirm={() => confirm && statusMut.mutate(confirm)}
      />
      <ConfirmDialog
        open={confirm === 'DELETE'}
        onClose={() => setConfirm(null)}
        title="Delete draft campaign"
        message="This draft campaign will be deleted permanently."
        confirmLabel="Delete"
        loading={delMut.isPending}
        onConfirm={() => delMut.mutate()}
      />
    </>
  );
}
