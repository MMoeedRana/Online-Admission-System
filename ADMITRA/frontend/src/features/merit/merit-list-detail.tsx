'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FilePenLine,
  Info,
  Megaphone,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useInstKey } from '@/features/institution/hooks';
import { Breakdown } from '@/features/results/my-results';
import type { BreakdownLine } from '@/features/advisor/types';
import { errorMessage, get, post } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatDateTime, toLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MeritList } from './merit-lists';

interface Pool {
  programId: string;
  programTitle: string;
  programCode: string;
  shift: string;
  capacity: number;
  seats: number;
  selected: number;
  waitlisted: number;
  openingAggregate: number | null;
  closingAggregate: number | null;
}
interface Entry {
  _id: string;
  applicationId: string;
  applicationNumber: string;
  shortName: string;
  programId: string;
  shift: string;
  preferenceOrder: number;
  aggregate: number;
  breakdown: BreakdownLine[];
  meritPosition: number;
  outcome: 'SELECTED' | 'WAITLISTED' | 'NOT_SELECTED';
  waitingPosition: number | null;
  offerStatus: string | null;
}
interface Detail {
  list: MeritList & {
    pools: Pool[];
    excluded: { applicationId: string; applicationNumber: string; name: string; reason: string }[];
    formulas: { programId: string; version: number }[];
  };
  entries: Entry[];
  can: { approve: boolean; publish: boolean; discard: boolean; revise: boolean };
}

/** One merit list: ranking, exclusions and the approval workflow (OFFER-1, OFFER-2, MERIT-6). */
export function MeritListDetail({ id }: { id: string }) {
  const key = useInstKey();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<'ranked' | 'excluded'>('ranked');
  const [pool, setPool] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'publish' | null>(null);
  const [discard, setDiscard] = useState(false);
  const [revise, setRevise] = useState(false);
  const [deadline, setDeadline] = useState(() => toLocalInput(new Date(Date.now() + 7 * 864e5)));
  const q = useQuery({ queryKey: key('merit-list', id), queryFn: () => get<Detail>(`/merit-lists/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: key() });
  const act = useMutation({
    mutationFn: (a: 'approve' | 'publish') => post(`/merit-lists/${id}/${a}`),
    onSuccess: async (_d, a) => {
      toast.success(
        a === 'approve'
          ? 'List approved. The admin can publish it now.'
          : 'List published. Offers created and applicants notified.',
      );
      setConfirm(null);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rev = useMutation({
    mutationFn: () => post<MeritList>(`/merit-lists/${id}/revise`, { offerDeadline: new Date(deadline).toISOString() }),
    onSuccess: async (l) => {
      toast.success(`Revision ${l.revision} generated. It replaces this list once approved and published.`);
      setRevise(false);
      await refresh();
      router.push(`/institution/merit-lists/${l._id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <FullPageLoader />;
  const { list: l, entries, can } = q.data;
  const mine = l.generatedBy === user?.id;
  const titleOf = (pid: string) => l.pools.find((p) => p.programId === pid)?.programTitle ?? '';
  const shown = entries.filter(
    (e) =>
      (!pool || `${e.programId}:${e.shift}` === pool) &&
      (!outcome || e.outcome === outcome) &&
      (!search || `${e.shortName} ${e.applicationNumber}`.toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <div className="space-y-6">
      <Link
        href={`/institution/merit-lists`}
        className="text-muted hover:text-primary inline-flex items-center gap-1 text-[12.5px] font-semibold"
      >
        <ArrowLeft className="size-3.5" /> Merit lists
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-bold tracking-tight">
              Merit list {l.listNumber}
              {l.revision > 1 && <span className="text-muted text-[16px] font-semibold"> · revision {l.revision}</span>}
            </h1>
            <StatusBadge status={l.status} />
          </div>
          <p className="text-muted mt-1 text-[13px]">
            Offer deadline {formatDateTime(l.offerDeadline)} · formulas{' '}
            {l.formulas.map((f) => `${titleOf(String(f.programId)).replace(/^BS /, '')} v${f.version}`).join(', ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={() => void downloadFile(`/merit-lists/${id}/pdf`, `merit-list-${l.listNumber}.pdf`)}
          >
            PDF
          </Button>
          {l.status === 'PUBLISHED' && (
            <Button
              variant="secondary"
              icon={<Eye className="size-4" />}
              onClick={() => window.open(`/merit-lists/${id}`, '_blank')}
            >
              Public page
            </Button>
          )}
          {can.discard && (
            <Button variant="ghost" icon={<Trash2 className="size-4 text-red-600" />} onClick={() => setDiscard(true)}>
              Discard
            </Button>
          )}
          {can.revise && (
            <Button variant="secondary" icon={<FilePenLine className="size-4" />} onClick={() => setRevise(true)}>
              Revise
            </Button>
          )}
          {can.approve && (
            <Button icon={<ShieldCheck className="size-4" />} onClick={() => setConfirm('approve')}>
              Approve
            </Button>
          )}
          {can.publish && (
            <Button icon={<Megaphone className="size-4" />} onClick={() => setConfirm('publish')}>
              Publish
            </Button>
          )}
        </div>
      </div>

      {l.status === 'DRAFT' && mine && (
        <Alert tone="info" title="Waiting for a second committee member">
          You generated this list, so another member must approve it (four-eyes rule, OFFER-1).
        </Alert>
      )}
      {l.status === 'APPROVED' && !can.publish && (
        <Alert tone="info">Approved by {l.approvedByName}. The institution admin publishes it.</Alert>
      )}
      {l.status === 'DISCARDED' && (
        <Alert tone="warning" title="Discarded">
          {l.discardReason}
        </Alert>
      )}

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Generated', by: l.generatedByName, at: l.createdAt, done: true },
          { label: 'Approved', by: l.approvedByName, at: l.approvedAt, done: Boolean(l.approvedAt) },
          { label: 'Published', by: l.publishedByName, at: l.publishedAt, done: Boolean(l.publishedAt) },
        ].map((s) => (
          <li
            key={s.label}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-4',
              s.done
                ? 'border-green-200 bg-green-50/60 dark:border-green-500/25 dark:bg-green-500/5'
                : 'border-line bg-card',
            )}
          >
            <CheckCircle2 className={cn('size-6 shrink-0', s.done ? 'text-green-600' : 'text-line')} />
            <div className="min-w-0">
              <p className="text-ink text-[14px] font-semibold">{s.label}</p>
              <p className="text-muted truncate text-[12px]">
                {s.done ? `${s.by} · ${formatDateTime(s.at)}` : 'Pending'}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" gap={0.05}>
        {l.pools.map((p) => {
          const k = `${p.programId}:${p.shift}`;
          return (
            <StaggerItem key={k}>
              <button
                onClick={() => setPool(pool === k ? '' : k)}
                className={cn(
                  'w-full rounded-2xl border p-4 text-left transition hover:shadow-md',
                  pool === k ? 'border-primary bg-primary-soft' : 'border-line bg-card',
                )}
              >
                <p className="text-ink truncate text-[14px] font-bold">{p.programTitle}</p>
                <p className="text-muted text-[12px]">
                  {p.shift.toLowerCase()} · {p.seats} free of {p.capacity} seats
                </p>
                <div className="bg-card-soft mt-3 h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${p.capacity ? (Math.min(p.selected, p.capacity) / p.capacity) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[12px]">
                  <span>
                    <b className="text-green-600">{p.selected}</b> selected ·{' '}
                    <b className="text-amber-600">{p.waitlisted}</b> waiting
                  </span>
                  <span className="text-ink font-semibold">close {p.closingAggregate?.toFixed(2) ?? '-'}</span>
                </div>
              </button>
            </StaggerItem>
          );
        })}
      </Stagger>

      <Card className="overflow-hidden">
        <div className="space-y-3 p-4 sm:p-5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'ranked', label: 'Ranked applications', count: entries.length },
              { value: 'excluded', label: 'Excluded', count: l.excluded.length },
            ]}
          />
          {tab === 'ranked' && (
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Input
                placeholder="Search name or application number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search"
              />
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome">
                <option value="">All outcomes</option>
                <option value="SELECTED">Selected</option>
                <option value="WAITLISTED">Waiting list</option>
                <option value="NOT_SELECTED">Not selected</option>
              </Select>
            </div>
          )}
        </div>
        {tab === 'ranked' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13.5px]">
              <thead>
                <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                  <th className="px-5 py-3 font-semibold">Pos.</th>
                  <th className="px-3 py-3 font-semibold">Applicant</th>
                  <th className="px-3 py-3 font-semibold">Program (preference)</th>
                  <th className="px-3 py-3 font-semibold">Aggregate</th>
                  <th className="px-3 py-3 font-semibold">Outcome</th>
                  <th className="px-3 py-3 font-semibold">Offer</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <Fragment key={e._id}>
                    <tr className="border-line hover:bg-card-soft/60 border-b">
                      <td className="text-ink px-5 py-3 font-bold tabular-nums">{e.meritPosition}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/institution/applications/${e.applicationId}`}
                          className="text-ink hover:text-primary font-semibold"
                        >
                          {e.shortName}
                        </Link>
                        <p className="text-muted font-mono text-[11.5px]">{e.applicationNumber}</p>
                      </td>
                      <td className="px-3 py-3">
                        {titleOf(e.programId)}{' '}
                        <span className="text-muted">
                          ({e.shift.toLowerCase()}, #{e.preferenceOrder})
                        </span>
                      </td>
                      <td className="text-ink px-3 py-3 font-bold tabular-nums">{e.aggregate.toFixed(2)}</td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          status={e.outcome}
                          label={e.outcome === 'WAITLISTED' ? `Waiting #${e.waitingPosition}` : undefined}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {e.offerStatus ? <StatusBadge status={e.offerStatus} /> : <span className="text-muted">-</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setOpen(open === e._id ? null : e._id)}
                          className="text-primary inline-flex items-center gap-1 text-[12.5px] font-semibold"
                        >
                          Breakdown <ChevronDown className={cn('size-4 transition', open === e._id && 'rotate-180')} />
                        </button>
                      </td>
                    </tr>
                    {open === e._id && (
                      <tr className="border-line bg-card-soft/50 border-b">
                        <td colSpan={7} className="px-5 pb-4">
                          <div className="max-w-xl">
                            <Breakdown lines={e.breakdown} aggregate={e.aggregate} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul>
            {l.excluded.length === 0 && (
              <li className="text-muted px-5 pb-6 text-[13px]">No applications were excluded.</li>
            )}
            {l.excluded.map((x) => (
              <li
                key={x.applicationId}
                className="border-line flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-[13.5px]"
              >
                <div>
                  <Link
                    href={`/institution/applications/${x.applicationId}`}
                    className="text-ink hover:text-primary font-semibold"
                  >
                    {x.name}
                  </Link>
                  <p className="text-muted font-mono text-[11.5px]">{x.applicationNumber}</p>
                </div>
                <Badge tone={x.reason === 'Marks not verified' ? 'red' : 'amber'}>{x.reason}</Badge>
              </li>
            ))}
            <li className="text-muted border-line flex items-start gap-2 border-t px-5 py-3 text-[12.5px]">
              <Info className="mt-0.5 size-4 shrink-0" /> Only applications whose marks are at or above the
              campaign&apos;s minimum trust level are ranked (MARK-10).
            </li>
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        variant="primary"
        loading={act.isPending}
        title={confirm === 'approve' ? 'Approve merit list' : 'Publish merit list'}
        message={
          confirm === 'approve'
            ? `You confirm that list ${l.listNumber} was generated correctly with the active formulas.`
            : `Offers will be created for ${l.counts.selected} applicants, the waiting list will be announced and every applicant will be notified. A published list cannot be edited.`
        }
        confirmLabel={confirm === 'approve' ? 'Approve' : 'Publish'}
        onConfirm={() => confirm && act.mutate(confirm)}
      />
      <ConfirmDialog
        open={discard}
        onClose={() => setDiscard(false)}
        title="Discard merit list"
        message="The list will not be published. A new list can then be generated."
        confirmLabel="Discard"
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          try {
            await post(`/merit-lists/${id}/discard`, { reason });
            setDiscard(false);
            await refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <Modal
        open={revise}
        onClose={() => setRevise(false)}
        title="Revise published list"
        description="A correction is a new revision that supersedes this list once approved and published (OFFER-2). Its offers are cancelled and replaced."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevise(false)}>
              Cancel
            </Button>
            <Button loading={rev.isPending} onClick={() => rev.mutate()}>
              Generate revision
            </Button>
          </>
        }
      >
        <Field label="New offer deadline" htmlFor="rev-deadline" required>
          <Input
            id="rev-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}
