'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useBrand } from '@/features/branding/brand-context';
import { errorMessage, get, getPaged, post } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { PageMeta } from '@/lib/types';
import { ChatPanel, MitraAvatar } from './chat';
import { base, pageBase, type Alert, type Briefing, type Scope } from './types';

const SEVERITY: Record<Alert['severity'], { tone: Tone; label: string }> = {
  HIGH: { tone: 'red', label: 'High' },
  MEDIUM: { tone: 'amber', label: 'Medium' },
  LOW: { tone: 'blue', label: 'Low' },
};

export function BriefingCard({ scope, compact = false }: { scope: Scope; compact?: boolean }) {
  const brand = useBrand();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['mitra', scope, 'briefings'],
    queryFn: () => get<Briefing[]>(`${base(scope)}/briefings`),
    retry: false,
  });
  const gen = useMutation({
    mutationFn: () => post<Briefing>(`${base(scope)}/briefings/generate`),
    onSuccess: async () => {
      toast.success('Briefing updated with the latest figures.');
      await qc.invalidateQueries({ queryKey: ['mitra', scope, 'briefings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isError) return null;
  const b = q.data?.[0];
  return (
    <Card className="relative h-full overflow-hidden">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-gradient-to-br from-[var(--primary)] to-violet-500 opacity-[0.12] blur-2xl"
      />
      <CardHeader
        title={
          <span className="flex items-center gap-2.5">
            <MitraAvatar className="size-8" /> {brand.agentName} briefing
          </span>
        }
        subtitle={
          b
            ? `${formatDate(b.date)} · ${b.generatedBy === 'AI' ? 'written by AI from live figures' : 'from live figures'}`
            : 'Your daily summary'
        }
        action={
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="size-4" />}
            loading={gen.isPending}
            onClick={() => gen.mutate()}
          >
            Refresh
          </Button>
        }
      />
      <div className="relative px-5 pt-3 pb-5 sm:px-6">
        {b ? (
          <>
            <p className="text-ink text-[14px] leading-relaxed">{b.summary}</p>
            {!compact && b.highlights.length > 0 && (
              <ul className="mt-4 space-y-2">
                {b.highlights.map((h, i) => (
                  <li key={i} className="text-body flex gap-2 text-[13.5px]">
                    <Sparkles className="text-primary mt-0.5 size-4 shrink-0" aria-hidden /> {h}
                  </li>
                ))}
              </ul>
            )}
            {compact && (
              <Link
                href={pageBase(scope)}
                className="text-primary mt-3 inline-block text-[13px] font-semibold hover:underline"
              >
                Open {brand.agentName}
              </Link>
            )}
          </>
        ) : (
          <p className="text-muted text-[13.5px]">
            No briefing yet. It is prepared every morning; press Refresh to make one now.
          </p>
        )}
      </div>
    </Card>
  );
}

function AlertsList({ scope }: { scope: Scope }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'OPEN' | 'REVIEWED' | 'DISMISSED'>('OPEN');
  const [review, setReview] = useState<{ alert: Alert; outcome: 'REVIEWED' | 'DISMISSED' } | null>(null);
  const [note, setNote] = useState('');
  const q = useQuery({
    queryKey: ['mitra', scope, 'alerts', status],
    queryFn: () => getPaged<Alert>(`${base(scope)}/alerts`, { status, limit: 50 }),
  });
  const refresh = useMutation({
    mutationFn: () => getPaged<Alert>(`${base(scope)}/alerts`, { refresh: true, status, limit: 50 }),
    onSuccess: async () => {
      toast.success('Integrity checks run again.');
      await qc.invalidateQueries({ queryKey: ['mitra', scope, 'alerts'] });
    },
  });
  const decide = useMutation({
    mutationFn: () => post(`${base(scope)}/alerts/${review!.alert._id}/review`, { outcome: review!.outcome, note }),
    onSuccess: async () => {
      toast.success('Alert updated.');
      setReview(null);
      setNote('');
      await qc.invalidateQueries({ queryKey: ['mitra', scope, 'alerts'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const counts = (
    (q.data?.meta as PageMeta & { counts?: { _id: { status: string; severity: string }; n: number }[] })?.counts ?? []
  ).reduce<Record<string, number>>((o, c) => ({ ...o, [c._id.status]: (o[c._id.status] ?? 0) + c.n }), {});
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'OPEN', label: 'Needs review', count: counts.OPEN ?? 0 },
            { value: 'REVIEWED', label: 'Reviewed', count: counts.REVIEWED ?? 0 },
            { value: 'DISMISSED', label: 'Dismissed', count: counts.DISMISSED ?? 0 },
          ]}
        />
        <Button
          variant="secondary"
          icon={<RefreshCw className="size-4" />}
          loading={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          Run checks now
        </Button>
      </Card>
      <p className="text-muted flex items-center gap-2 text-[12.5px]">
        <ShieldAlert className="size-4" aria-hidden /> Alerts are patterns found by fixed rules with their evidence.
        They need a human review and are not proof of wrongdoing.
      </p>
      {q.data?.data.length ? (
        <Stagger className="grid gap-4 xl:grid-cols-2">
          {q.data.data.map((a) => (
            <StaggerItem key={a._id} className="min-w-0">
              <Card className="h-full p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY[a.severity].tone}>
                    <AlertTriangle className="size-3.5" aria-hidden /> {SEVERITY[a.severity].label}
                  </Badge>
                  {a.institution && (
                    <Badge tone="gray" dot={false}>
                      {a.institution}
                    </Badge>
                  )}
                  <span className="text-muted ml-auto text-[12px]">since {formatDate(a.firstSeenAt)}</span>
                </div>
                <p className="text-ink mt-3 text-[15px] font-bold">{a.title}</p>
                <p className="text-body mt-1 text-[13.5px]">{a.detail}</p>
                {a.evidence.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {a.evidence.map((e) => (
                      <li
                        key={e}
                        className="bg-card-soft border-line text-body rounded-lg border px-2 py-1 font-mono text-[11.5px]"
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
                {a.status === 'OPEN' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<CheckCircle2 className="size-4" />}
                      onClick={() => setReview({ alert: a, outcome: 'REVIEWED' })}
                    >
                      Mark reviewed
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<XCircle className="size-4" />}
                      onClick={() => setReview({ alert: a, outcome: 'DISMISSED' })}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted mt-3 text-[12.5px]">
                    {a.status === 'REVIEWED' ? 'Reviewed' : 'Dismissed'} by {a.reviewedByName || '-'}
                    {a.note ? `: “${a.note}”` : ''}
                  </p>
                )}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title={status === 'OPEN' ? 'Nothing needs a review' : 'No alerts here'}
            text="The integrity checks run every morning and whenever you ask."
          />
        </Card>
      )}
      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={review?.outcome === 'DISMISSED' ? 'Dismiss alert' : 'Mark alert as reviewed'}
        description={review?.alert.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button loading={decide.isPending} onClick={() => decide.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <label htmlFor="alert-note" className="text-ink text-[13px] font-semibold">
          What did you check? (kept in the audit log)
        </label>
        <Textarea
          id="alert-note"
          className="mt-2"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Checked the bank statement; the remaining amount was paid in cash."
        />
      </Modal>
    </div>
  );
}

export function MitraPage({ scope }: { scope: Scope }) {
  const brand = useBrand();
  const [tab, setTab] = useState<'ask' | 'briefing' | 'alerts'>('ask');
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <MitraAvatar className="size-10" /> {brand.agentName}
          </span>
        }
        subtitle={
          scope === 'platform'
            ? `Your admission operations copilot for the whole ${brand.platformName} platform`
            : 'Your admission operations copilot for this institution'
        }
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'ask', label: `Ask ${brand.agentName}` },
              { value: 'briefing', label: 'Briefing' },
              { value: 'alerts', label: 'Integrity alerts' },
            ]}
          />
        }
      />
      {tab === 'ask' && <ChatPanel scope={scope} />}
      {tab === 'briefing' && (
        <Reveal>
          <BriefingHistory scope={scope} />
        </Reveal>
      )}
      {tab === 'alerts' && <AlertsList scope={scope} />}
    </>
  );
}

function BriefingHistory({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ['mitra', scope, 'briefings'],
    queryFn: () => get<Briefing[]>(`${base(scope)}/briefings`),
  });
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <BriefingCard scope={scope} />
      <Card>
        <CardHeader title="Earlier briefings" />
        <ul className="divide-line divide-y px-5 pt-2 pb-4 sm:px-6">
          {(q.data ?? []).slice(1).map((b) => (
            <li key={b._id} className="py-3">
              <p className="text-ink text-[13px] font-semibold">{formatDate(b.date)}</p>
              <p className="text-body mt-1 line-clamp-3 text-[13px]">{b.summary}</p>
            </li>
          ))}
          {(q.data?.length ?? 0) <= 1 && (
            <li className="text-muted py-4 text-[13px]">Earlier briefings appear here.</li>
          )}
        </ul>
        <p className="text-muted px-5 pb-5 text-[12px] sm:px-6">
          Updated {q.data?.[0] ? formatDateTime(q.data[0].updatedAt) : '-'}.
        </p>
      </Card>
    </div>
  );
}
