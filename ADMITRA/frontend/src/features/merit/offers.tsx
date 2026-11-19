'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, FileCheck2, GraduationCap, Hourglass, Search, ShieldX, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/input';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useInstKey } from '@/features/institution/hooks';
import { errorMessage, fieldErrors, get, getPaged, post } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatDateTime, formatMoney } from '@/lib/format';
import { CampaignPicker, useCampaign } from './campaign-picker';

interface OfferRow {
  _id: string;
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  program: { title: string; code: string } | null;
  shift: string;
  meritPosition: number;
  aggregate: number;
  deadline: string;
  status: string;
  reason: string;
  voucher: { voucherNumber: string; status: string; amount: number } | null;
  enrollment: { _id: string; status: string; registrationNumber: string | null; originalsVerified: boolean } | null;
}
interface Summary {
  pendingOriginals: number;
  rows: {
    programId: string;
    title: string;
    code: string;
    shift: string;
    seats: number;
    offered: number;
    accepted: number;
    enrolled: number;
    declined: number;
    expired: number;
    revoked: number;
  }[];
}

type TabKey = 'ALL' | 'OFFERED' | 'ACCEPTED' | 'PENDING_ORIGINALS' | 'ENROLLED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

/** Section 3.13: offers, admission fees, enrollment, originals (MARK-12) and revocation (MARK-11). */
export function OffersPage() {
  const { campaigns, id, select, loading } = useCampaign();
  const key = useInstKey();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<TabKey>('ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [revoke, setRevoke] = useState<OfferRow | null>(null);
  const summary = useQuery({
    queryKey: key('offers-summary', id),
    queryFn: () => get<Summary>('/offers/summary', { campaignId: id }),
    enabled: Boolean(id),
  });
  const list = useQuery({
    queryKey: key('offers', id, tab, q, page),
    queryFn: () =>
      getPaged<OfferRow>('/offers', {
        campaignId: id,
        status: tab === 'ALL' ? undefined : tab,
        q: q || undefined,
        page,
      }),
    enabled: Boolean(id),
    placeholderData: (p) => p,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key() });
  const originals = useMutation({
    mutationFn: (enrollmentId: string) => post(`/offers/enrollments/${enrollmentId}/originals`),
    onSuccess: async () => {
      toast.success('Originals verified. Registration number issued.');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (loading) return <FullPageLoader />;
  const totals = (summary.data?.rows ?? []).reduce(
    (t, r) => ({
      seats: t.seats + r.seats,
      offered: t.offered + r.offered,
      accepted: t.accepted + r.accepted,
      enrolled: t.enrolled + r.enrolled,
      lost: t.lost + r.declined + r.expired + r.revoked,
    }),
    { seats: 0, offered: 0, accepted: 0, enrolled: 0, lost: 0 },
  );
  return (
    <>
      <PageHeader
        title="Offers & Enrollment"
        subtitle="Offers from published merit lists, admission fees, originals check and enrollment"
        actions={campaigns.length ? <CampaignPicker value={id} campaigns={campaigns} onChange={select} /> : undefined}
      />
      {!id ? (
        <Card>
          <EmptyState
            icon={Award}
            title="No admission campaign yet"
            text="Offers are created when a merit list is published."
          />
        </Card>
      ) : (
        <>
          <KpiGrid className="mb-6">
            <KpiCard
              label="Enrolled"
              value={totals.enrolled}
              sub="Registration number issued"
              icon={GraduationCap}
              tint="green"
            />
            <KpiCard label="Open offers" value={totals.offered} sub="Waiting for acceptance" icon={Award} />
            <KpiCard
              label="Accepted, fee pending"
              value={totals.accepted}
              sub={`${summary.data?.pendingOriginals ?? 0} waiting for the originals check`}
              icon={Hourglass}
              tint="amber"
            />
            <KpiCard
              label="Seats released"
              value={totals.lost}
              sub="Declined, expired or revoked"
              icon={ShieldX}
              tint="purple"
            />
          </KpiGrid>
          <Card className="mb-6 overflow-hidden">
            <CardHeader
              title="Seats by program"
              subtitle="Declined, expired and revoked seats are offered in the next merit list"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                    <th className="px-5 py-3 font-semibold">Program</th>
                    <th className="px-3 py-3 font-semibold">Seats</th>
                    <th className="px-3 py-3 font-semibold">Enrolled</th>
                    <th className="px-3 py-3 font-semibold">Accepted</th>
                    <th className="px-3 py-3 font-semibold">Open</th>
                    <th className="px-3 py-3 font-semibold">Declined</th>
                    <th className="px-3 py-3 font-semibold">Expired</th>
                    <th className="px-5 py-3 font-semibold">Filled</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.data?.rows ?? []).map((r) => {
                    const filled = r.enrolled + r.accepted;
                    return (
                      <tr key={`${r.programId}${r.shift}`} className="border-line border-b last:border-0">
                        <td className="text-ink px-5 py-3 font-semibold">
                          {r.title} <span className="text-muted font-normal">({r.shift.toLowerCase()})</span>
                        </td>
                        <td className="px-3 py-3">{r.seats}</td>
                        <td className="px-3 py-3 font-semibold text-green-600">{r.enrolled}</td>
                        <td className="px-3 py-3">{r.accepted}</td>
                        <td className="px-3 py-3">{r.offered}</td>
                        <td className="px-3 py-3">{r.declined}</td>
                        <td className="px-3 py-3">{r.expired}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="bg-card-soft h-2 w-28 overflow-hidden rounded-full">
                              <div
                                className="h-full rounded-full bg-green-500"
                                style={{ width: `${Math.min(100, (filled / Math.max(1, r.seats)) * 100)}%` }}
                              />
                            </div>
                            <span className="text-muted text-[12px]">{filled}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="grid gap-3 p-4 sm:p-5 2xl:grid-cols-[1fr_320px] 2xl:items-center">
              <Tabs
                value={tab}
                onChange={(v) => (setTab(v), setPage(1))}
                tabs={[
                  { value: 'ALL', label: 'All' },
                  { value: 'OFFERED', label: 'Offered' },
                  { value: 'ACCEPTED', label: 'Accepted' },
                  { value: 'PENDING_ORIGINALS', label: 'Originals pending', count: summary.data?.pendingOriginals },
                  { value: 'ENROLLED', label: 'Enrolled' },
                  { value: 'DECLINED', label: 'Declined' },
                  { value: 'EXPIRED', label: 'Expired' },
                  { value: 'REVOKED', label: 'Revoked' },
                ]}
              />
              <label className="relative">
                <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
                <Input
                  className="pl-10"
                  placeholder="Name or application number"
                  value={q}
                  onChange={(e) => (setQ(e.target.value), setPage(1))}
                  aria-label="Search offers"
                />
              </label>
            </div>
            <DataTable
              loading={list.isLoading}
              rows={list.data?.data ?? []}
              rowKey={(r) => r._id}
              empty={
                <EmptyState
                  icon={Award}
                  title="No offers here"
                  text="Offers are created when a merit list is published."
                />
              }
              columns={[
                {
                  key: 'who',
                  header: 'Applicant',
                  primary: true,
                  cell: (r) => (
                    <div>
                      <Link
                        href={`/institution/applications/${r.applicationId}`}
                        className="text-ink hover:text-primary font-semibold"
                      >
                        {r.applicantName}
                      </Link>
                      <p className="text-muted font-mono text-[11.5px]">{r.applicationNumber}</p>
                    </div>
                  ),
                },
                { key: 'prog', header: 'Program', cell: (r) => `${r.program?.title ?? ''} (${r.shift.toLowerCase()})` },
                {
                  key: 'pos',
                  header: 'Pos. / aggregate',
                  cell: (r) => `#${r.meritPosition} · ${r.aggregate.toFixed(2)}`,
                },
                {
                  key: 'fee',
                  header: 'Admission fee',
                  cell: (r) =>
                    r.voucher ? (
                      <StatusBadge
                        status={r.voucher.status}
                        label={r.voucher.status === 'ISSUED' ? `${formatMoney(r.voucher.amount)} due` : undefined}
                      />
                    ) : (
                      <span className="text-muted">-</span>
                    ),
                  hideOnMobile: true,
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) =>
                    r.enrollment?.status === 'ENROLLED' ? (
                      <div>
                        <StatusBadge status="ENROLLED" />
                        <p className="text-ink mt-1 font-mono text-[11.5px] font-semibold">
                          {r.enrollment.registrationNumber}
                        </p>
                      </div>
                    ) : r.enrollment?.status === 'PENDING_ORIGINALS' ? (
                      <StatusBadge status="PENDING_ORIGINALS" />
                    ) : (
                      <div>
                        <StatusBadge status={r.status} />
                        {r.status === 'OFFERED' && (
                          <p className="text-muted mt-1 text-[11.5px]">until {formatDateTime(r.deadline)}</p>
                        )}
                      </div>
                    ),
                },
                {
                  key: 'act',
                  header: '',
                  className: 'text-right',
                  cell: (r) => (
                    <div className="flex justify-end gap-1.5">
                      {r.enrollment?.status === 'PENDING_ORIGINALS' && can('applications.review') && (
                        <Button
                          size="sm"
                          icon={<UserCheck className="size-4" />}
                          loading={originals.isPending && originals.variables === r.enrollment._id}
                          onClick={() => originals.mutate(r.enrollment!._id)}
                        >
                          Originals checked
                        </Button>
                      )}
                      {r.enrollment?.status === 'ENROLLED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<FileCheck2 className="size-4" />}
                          onClick={() =>
                            void downloadFile(
                              `/offers/enrollments/${r.enrollment!._id}/letter.pdf`,
                              `${r.enrollment!.registrationNumber}.pdf`,
                            )
                          }
                        >
                          Letter
                        </Button>
                      )}
                      {can('merit.publish') && ['OFFERED', 'ACCEPTED', 'ENROLLED'].includes(r.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ShieldX className="size-4 text-red-600" />}
                          onClick={() => setRevoke(r)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Pagination meta={list.data?.meta} onPage={setPage} className="p-4" />
          </Card>
        </>
      )}
      {revoke && <RevokeDialog offer={revoke} onClose={() => setRevoke(null)} onDone={refresh} />}
    </>
  );
}

function RevokeDialog({ offer, onClose, onDone }: { offer: OfferRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [block, setBlock] = useState(true);
  const [err, setErr] = useState('');
  const go = useMutation({
    mutationFn: () => post(`/offers/${offer._id}/revoke`, { reason, blockCnic: block }),
    onSuccess: () => {
      toast.success('Admission revoked and the seat released.');
      onDone();
      onClose();
    },
    onError: (e) => {
      setErr(fieldErrors(e).reason ?? '');
      toast.error(errorMessage(e));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Revoke admission: ${offer.applicantName}`}
      description="Use this when false marks or documents are confirmed (MARK-11). The applicant is notified with the reason."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 10}
            loading={go.isPending}
            onClick={() => go.mutate()}
          >
            Revoke admission
          </Button>
        </>
      }
    >
      <Field
        label="Written reason"
        htmlFor="rv-reason"
        required
        error={err}
        hint="At least 10 characters. Shown to the applicant and kept in the audit trail."
      >
        <Textarea id="rv-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Checkbox
        className="mt-4"
        label="Block this CNIC for the rest of this admission cycle"
        description="The applicant cannot apply again in this campaign."
        checked={block}
        onChange={(e) => setBlock(e.target.checked)}
      />
    </Modal>
  );
}
