'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  CalendarClock,
  ChevronDown,
  Clock,
  Compass,
  Download,
  FileText,
  ListChecks,
  PartyPopper,
  TrendingDown,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { AdvisorResult, BreakdownLine } from '@/features/advisor/types';
import { BandBadge } from '@/features/advisor/band';
import { api, errorMessage, post } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ResultItem {
  application: { _id: string; applicationNumber: string; status: string };
  institution: { name: string; shortName: string; city: string };
  campaign: { title: string; code: string };
  preferences: { program: string; shift: string; order: number }[];
  result: string;
  latest: {
    list: { _id: string; listNumber: number; revision: number; publishedAt: string };
    entry: {
      outcome: 'SELECTED' | 'WAITLISTED' | 'NOT_SELECTED';
      program: string;
      shift: string;
      preferenceOrder: number;
      meritPosition: number;
      waitingPosition: number | null;
      aggregate: number;
      breakdown: BreakdownLine[];
    } | null;
    pool: { seats: number; closingAggregate: number | null; openingAggregate: number | null } | null;
    gap: number | null;
    waitlist: { expectedVacancies: number; chance: 'HIGH' | 'MEDIUM' | 'LOW'; declineRate: number } | null;
    excludedReason: string | null;
  } | null;
  offer: {
    _id: string;
    status: string;
    deadline: string;
    program: string;
    shift: string;
    meritPosition: number;
    aggregate: number;
    admissionFee: number;
    reason: string;
  } | null;
  voucher: { _id: string; voucherNumber: string; amount: number; status: string; dueDate: string } | null;
  payment: { status: string; reference: string; receiptNumber: string | null; _id: string } | null;
  enrollment: { _id: string; status: string; registrationNumber: string | null; enrolledAt: string | null } | null;
}

const KIND: Record<
  string,
  { label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'purple'; icon: typeof Award; bar: string }
> = {
  SELECTED: { label: 'Selected', tone: 'green', icon: Award, bar: 'from-green-500 to-emerald-400' },
  ENROLLED: { label: 'Enrolled', tone: 'green', icon: PartyPopper, bar: 'from-green-600 to-teal-400' },
  WAITLISTED: { label: 'Waiting list', tone: 'amber', icon: Clock, bar: 'from-amber-500 to-yellow-400' },
  NOT_SELECTED: { label: 'Not selected', tone: 'gray', icon: TrendingDown, bar: 'from-slate-400 to-slate-300' },
  PENDING: { label: 'Pending', tone: 'blue', icon: Clock, bar: 'from-blue-500 to-sky-400' },
  EXCLUDED: { label: 'Not ranked', tone: 'red', icon: XCircle, bar: 'from-red-500 to-rose-400' },
  OFFER_DECLINED: { label: 'Offer declined', tone: 'gray', icon: XCircle, bar: 'from-slate-400 to-slate-300' },
  OFFER_EXPIRED: { label: 'Offer expired', tone: 'red', icon: XCircle, bar: 'from-red-500 to-rose-400' },
  REVOKED: { label: 'Admission revoked', tone: 'red', icon: XCircle, bar: 'from-red-600 to-rose-500' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'gray', icon: XCircle, bar: 'from-slate-400 to-slate-300' },
  REJECTED: { label: 'Not accepted', tone: 'red', icon: XCircle, bar: 'from-red-500 to-rose-400' },
};

const CHANCE = {
  HIGH: { label: 'High', tone: 'green' as const },
  MEDIUM: { label: 'Medium', tone: 'amber' as const },
  LOW: { label: 'Low', tone: 'gray' as const },
};

export function useResults() {
  return useQuery({
    queryKey: ['me', 'results'],
    queryFn: async () =>
      (await api.get<{ data: ResultItem[]; meta: { suggestions: AdvisorResult[] } }>('/me/results')).data,
  });
}

/** FIND-1 to FIND-4 and FIND-8 (Figure 4.9): one card per application in every institution. */
export function MyResults() {
  const q = useResults();
  if (!q.data) return <FullPageLoader />;
  const items = q.data.data;
  const suggestions = q.data.meta.suggestions ?? [];
  return (
    <>
      <PageHeader
        title="Where is my name?"
        subtitle="The result of the latest merit list of every application, in one place"
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No submitted applications"
            text="Results appear here when institutions publish their merit lists."
            action={<ButtonLink href="/applicant/advisor">Find programs for my marks</ButtonLink>}
          />
        </Card>
      ) : (
        <Stagger className="grid gap-5 xl:grid-cols-2" gap={0.07}>
          {items.map((r) => (
            <StaggerItem key={r.application._id} className="min-w-0">
              <ResultCard r={r} suggestions={suggestions} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}

function ResultCard({ r, suggestions }: { r: ResultItem; suggestions: AdvisorResult[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [decline, setDecline] = useState(false);
  const kind = r.enrollment?.status === 'ENROLLED' ? 'ENROLLED' : r.result === 'OFFER_ISSUED' ? 'SELECTED' : r.result;
  const k = KIND[kind] ?? KIND.PENDING!;
  const e = r.latest?.entry;
  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });
  const accept = useMutation({
    mutationFn: () => post(`/me/offers/${r.offer!._id}/accept`),
    onSuccess: async () => {
      toast.success('Offer accepted. Pay the admission fee before the deadline.');
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const Icon = k.icon;
  const offerOpen = r.offer?.status === 'OFFERED' && new Date(r.offer.deadline) > new Date();
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('h-1.5 w-full bg-gradient-to-r', k.bar)} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink truncate text-[16px] font-bold">{r.institution.name}</p>
            <p className="text-muted text-[12.5px]">
              {r.campaign.title} · {r.application.applicationNumber}
            </p>
          </div>
          <span
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold', {
              'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300': k.tone === 'green',
              'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300': k.tone === 'amber',
              'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300': k.tone === 'red',
              'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300': k.tone === 'blue',
              'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300': k.tone === 'gray',
            })}
          >
            <Icon className="size-4" /> {k.label}
          </span>
        </div>

        {e ? (
          <div className="bg-card-soft mt-4 grid grid-cols-2 gap-4 rounded-2xl p-4 sm:grid-cols-4">
            <Fact
              label="Merit list"
              value={`No. ${r.latest!.list.listNumber}${r.latest!.list.revision > 1 ? ` (rev. ${r.latest!.list.revision})` : ''}`}
            />
            <Fact
              label={e.outcome === 'WAITLISTED' ? 'Waiting position' : 'Merit position'}
              value={e.outcome === 'WAITLISTED' ? `#${e.waitingPosition}` : `#${e.meritPosition}`}
            />
            <Fact label="Your aggregate" value={e.aggregate.toFixed(2)} />
            <Fact label="Last selected" value={r.latest!.pool?.closingAggregate?.toFixed(2) ?? '-'} />
            <p className="text-body col-span-2 text-[13px] sm:col-span-4">
              <b className="text-ink">{e.program}</b> ({e.shift.toLowerCase()} shift, preference {e.preferenceOrder})
            </p>
          </div>
        ) : r.latest?.excludedReason ? (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-[13.5px] text-red-800 dark:bg-red-500/10 dark:text-red-200">
            Merit list {r.latest.list.listNumber} did not rank this application: <b>{r.latest.excludedReason}</b>.
          </p>
        ) : (
          <div className="bg-card-soft mt-4 rounded-2xl p-4 text-[13.5px]">
            <p>No merit list has been published for this application yet.</p>
            <p className="text-muted mt-1 flex items-center gap-2">
              Application status <StatusBadge status={r.application.status} />
            </p>
          </div>
        )}

        {/* FIND-2: Selected */}
        {kind === 'SELECTED' && r.offer && (
          <div className="mt-4 space-y-3">
            {r.offer.status === 'OFFERED' && (
              <>
                <p
                  className={cn(
                    'flex items-center gap-2 text-[13.5px] font-semibold',
                    offerOpen ? 'text-green-700 dark:text-green-400' : 'text-red-600',
                  )}
                >
                  <CalendarClock className="size-4" />{' '}
                  {offerOpen ? `Accept by ${formatDateTime(r.offer.deadline)}` : 'The deadline has passed'}
                </p>
                {offerOpen && (
                  <div className="flex flex-wrap gap-2">
                    <Button loading={accept.isPending} onClick={() => accept.mutate()}>
                      Accept offer
                    </Button>
                    <Button variant="secondary" onClick={() => setDecline(true)}>
                      Decline
                    </Button>
                    <ButtonLink
                      variant="ghost"
                      href={`/applicant/offers/${r.application._id}`}
                      icon={<ArrowRight className="size-4" />}
                    >
                      Offer details
                    </ButtonLink>
                  </div>
                )}
              </>
            )}
            {r.offer.status === 'ACCEPTED' && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13.5px]">
                  Offer accepted. Admission fee <b>{formatMoney(r.voucher?.amount)}</b> ·{' '}
                  {r.voucher?.status === 'AWAITING_VERIFICATION'
                    ? 'proof under verification'
                    : `due ${formatDate(r.voucher?.dueDate)}`}
                </p>
                <ButtonLink
                  href={`/applicant/offers/${r.application._id}`}
                  size="sm"
                  icon={<ArrowRight className="size-4" />}
                >
                  {r.voucher?.status === 'ISSUED' ? 'Pay admission fee' : 'Track enrollment'}
                </ButtonLink>
              </div>
            )}
            {r.enrollment?.status === 'PENDING_ORIGINALS' && (
              <p className="rounded-xl bg-blue-50 p-3 text-[13px] text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
                Fee received. Bring your original documents on the reporting day; your registration number is issued
                after the check.
              </p>
            )}
          </div>
        )}

        {kind === 'ENROLLED' && r.enrollment && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-green-50 p-4 dark:bg-green-500/10">
            <div>
              <p className="text-[12px] font-semibold text-green-800 dark:text-green-300">Registration number</p>
              <p className="text-[19px] font-extrabold tracking-wide text-green-900 dark:text-green-100">
                {r.enrollment.registrationNumber}
              </p>
            </div>
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() =>
                void downloadFile(
                  `/me/enrollments/${r.enrollment!._id}/letter.pdf`,
                  `${r.enrollment!.registrationNumber}.pdf`,
                )
              }
            >
              Admission letter
            </Button>
          </div>
        )}

        {/* FIND-3: Waitlisted */}
        {kind === 'WAITLISTED' && r.latest?.waitlist && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[13.5px]">
            <Badge tone={CHANCE[r.latest.waitlist.chance].tone}>
              {CHANCE[r.latest.waitlist.chance].label} chance in the next list
            </Badge>
            <span className="text-muted">
              About {r.latest.waitlist.expectedVacancies} seat{r.latest.waitlist.expectedVacancies === 1 ? '' : 's'}{' '}
              expected to become free ({Math.round(r.latest.waitlist.declineRate * 100)}% of {r.latest.pool?.seats}{' '}
              seats decline).
            </span>
          </div>
        )}

        {/* FIND-4: Not selected */}
        {kind === 'NOT_SELECTED' && r.latest?.gap != null && (
          <div className="mt-4 space-y-3">
            <p className="text-[13.5px]">
              You were <b className="text-red-600">{Math.abs(r.latest.gap).toFixed(2)} marks</b> below the last selected
              aggregate.
            </p>
            {suggestions.length > 0 && (
              <div>
                <p className="text-ink mb-2 flex items-center gap-2 text-[13px] font-semibold">
                  <Compass className="text-primary size-4" /> Programs where your marks are likely enough
                </p>
                <ul className="space-y-2">
                  {suggestions.slice(0, 3).map((s) => (
                    <li key={s.directoryProgramId}>
                      <Link
                        href={`/applicant/advisor/${s.directoryProgramId}?saved=1`}
                        className="border-line hover:border-primary/40 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[13px]"
                      >
                        <span className="min-w-0">
                          <b className="text-ink block truncate">{s.title}</b>
                          <span className="text-muted">{s.institution.name}</span>
                        </span>
                        <BandBadge band={s.band} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {kind === 'REVOKED' && r.offer?.reason && (
          <p className="mt-4 text-[13.5px] text-red-700">Reason: {r.offer.reason}</p>
        )}

        {(e || r.latest) && (
          <div className="border-line mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-[13px]">
            {e && (
              <button
                onClick={() => setOpen(!open)}
                className="text-primary inline-flex items-center gap-1 font-semibold"
              >
                How my aggregate was calculated{' '}
                <ChevronDown className={cn('size-4 transition', open && 'rotate-180')} />
              </button>
            )}
            {r.latest && (
              <Link
                href={`/merit-lists/${r.latest.list._id}`}
                className="text-muted hover:text-primary ml-auto inline-flex items-center gap-1 font-semibold"
              >
                <FileText className="size-4" /> View the list
              </Link>
            )}
          </div>
        )}
        <AnimatePresence initial={false}>
          {open && e && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <Breakdown lines={e.breakdown} aggregate={e.aggregate} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ConfirmDialog
        open={decline}
        onClose={() => setDecline(false)}
        title="Decline offer"
        message="Your seat will be offered to the next applicant. This cannot be undone."
        confirmLabel="Decline offer"
        onConfirm={async () => {
          try {
            await post(`/me/offers/${r.offer!._id}/decline`);
            setDecline(false);
            toast.success('Offer declined.');
            await refresh();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-[11.5px]">{label}</p>
      <p className="text-ink text-[16px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** FIND-8: component, percentage, weight and contribution. */
export function Breakdown({ lines, aggregate }: { lines: BreakdownLine[]; aggregate: number }) {
  return (
    <table className="mt-3 w-full text-left text-[13px]">
      <thead>
        <tr className="text-muted text-[11px] tracking-wide uppercase">
          <th className="py-1.5 font-semibold">Component</th>
          <th className="py-1.5 font-semibold">%</th>
          <th className="py-1.5 font-semibold">Weight</th>
          <th className="py-1.5 text-right font-semibold">Contribution</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.component} className="border-line border-t">
            <td className="py-2">{l.label}</td>
            <td className="py-2 tabular-nums">{l.percentage ?? '-'}</td>
            <td className="py-2 tabular-nums">{l.weight}%</td>
            <td className="py-2 text-right font-semibold tabular-nums">{l.contribution.toFixed(2)}</td>
          </tr>
        ))}
        <tr className="border-line border-t">
          <td className="text-ink py-2 font-bold" colSpan={3}>
            Aggregate
          </td>
          <td className="text-primary py-2 text-right font-extrabold tabular-nums">{aggregate.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Figure 4.5: the dashboard highlights newly published merit lists with a direct link. */
export function ResultHighlights() {
  const q = useResults();
  const now = q.dataUpdatedAt;
  const fresh = (q.data?.data ?? []).filter(
    (r) => r.latest?.entry && now - new Date(r.latest.list.publishedAt).getTime() < 21 * 86_400_000,
  );
  if (!fresh.length) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {fresh.map((r) => {
        const kind =
          r.enrollment?.status === 'ENROLLED' ? 'ENROLLED' : r.result === 'OFFER_ISSUED' ? 'SELECTED' : r.result;
        const k = KIND[kind] ?? KIND.PENDING!;
        const Icon = k.icon;
        return (
          <motion.div
            key={r.application._id}
            className="min-w-0"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              href={kind === 'SELECTED' ? `/applicant/offers/${r.application._id}` : '/applicant/results'}
              className="group bg-navy relative flex items-center gap-4 overflow-hidden rounded-2xl p-5 text-white shadow-lg transition hover:-translate-y-0.5"
            >
              <span className={cn('absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', k.bar)} />
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                <Icon className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-blue-100/80">
                  Merit list {r.latest!.list.listNumber} published · {r.institution.name}
                </span>
                <span className="block truncate text-[16px] font-bold">
                  {k.label}: {r.latest!.entry!.program}
                  {kind === 'WAITLISTED'
                    ? ` (waiting #${r.latest!.entry!.waitingPosition})`
                    : kind === 'SELECTED'
                      ? ` (position #${r.latest!.entry!.meritPosition})`
                      : ''}
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-1" />
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
