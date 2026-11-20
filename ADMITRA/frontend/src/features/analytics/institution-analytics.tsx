'use client';

import { useQuery } from '@tanstack/react-query';
import { Banknote, Download, FileText, GraduationCap, ListOrdered, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { Reveal } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-context';
import { useInstKey } from '@/features/institution/hooks';
import { get } from '@/lib/api';
import { downloadFile, openFile } from '@/lib/files';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { DailyBars, Funnel, Meter } from './charts';

export interface Analytics {
  generatedAt: string;
  campaigns: { id: string; title: string; code: string; status: string }[];
  kpis: {
    submitted: number;
    applicants: number;
    seats: number;
    feeCollected: number;
    enrolled: number;
    documentRejectionRate: number;
    verifiedMarksShare: number;
  };
  funnel: { key: string; label: string; value: number }[];
  dailySubmissions: { date: string; count: number }[];
  programs: {
    programId: string;
    title: string;
    code: string;
    seats: number;
    applications: number;
    firstChoice: number;
    applicants: number;
    applicationsPerSeat: number;
    applicantsPerSeat: number;
  }[];
  fees: {
    application: { issued: number; collected: number; outstanding: number };
    admission: { issued: number; collected: number; outstanding: number };
    payments: { verified: number; verifiedAmount: number; pending: number; rejected: number };
  };
  documents: { reviewed: number; approved: number; rejected: number; rejectionRate: number; awaitingReview: number };
  marks: { totalRecords: number; verifiedRecords: number; verifiedShare: number; byStatus: Record<string, number> };
  statuses: { status: string; count: number }[];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function InstitutionAnalytics() {
  const key = useInstKey();
  const { can } = useAuth();
  const [campaignId, setCampaignId] = useState('');
  const [days, setDays] = useState<'14' | '30'>('14');
  const q = useQuery({
    queryKey: key('analytics', campaignId, days),
    queryFn: () => get<Analytics>('/analytics', { campaignId: campaignId || undefined, days }),
    placeholderData: (prev) => prev,
  });
  if (!q.data) return <FullPageLoader />;
  const d = q.data;
  const qs = campaignId ? `?campaignId=${campaignId}` : '';
  const maxPerSeat = Math.max(1, ...d.programs.map((p) => p.applicationsPerSeat));
  const fee = (f: { issued: number; collected: number }) => pct(f.collected, f.issued);

  return (
    <>
      <PageHeader
        title="Analytics & reports"
        subtitle={`Figures are refreshed at most every 30 seconds · updated ${formatDateTime(d.generatedAt)}`}
      />

      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-80">
          <label htmlFor="an-campaign" className="text-muted text-[12px] font-semibold tracking-wide uppercase">
            Campaign
          </label>
          <Select id="an-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">All campaigns</option>
            {d.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.code})
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted text-[12px] font-semibold tracking-wide uppercase">Daily submissions</span>
          <Tabs
            value={days}
            onChange={setDays}
            tabs={[
              { value: '14', label: 'Last 14 days' },
              { value: '30', label: 'Last 30 days' },
            ]}
          />
        </div>
      </Card>

      <KpiGrid>
        <KpiCard
          label="Applications submitted"
          value={formatNumber(d.kpis.submitted)}
          sub={`${formatNumber(d.kpis.applicants)} applicants · ${formatNumber(d.kpis.seats)} seats`}
          icon={FileText}
        />
        <KpiCard
          label="Fee collected"
          value={formatMoney(d.kpis.feeCollected)}
          sub={`${d.fees.payments.pending} payment proof(s) waiting`}
          icon={Banknote}
          tint="amber"
        />
        <KpiCard
          label="Verified marks"
          value={`${d.kpis.verifiedMarksShare}%`}
          sub={`${formatNumber(d.marks.verifiedRecords)} of ${formatNumber(d.marks.totalRecords)} records`}
          icon={ShieldCheck}
          tint="green"
        />
        <KpiCard
          label="Enrolled"
          value={formatNumber(d.kpis.enrolled)}
          sub={`${pct(d.kpis.enrolled, d.kpis.submitted)}% of submitted applications`}
          icon={GraduationCap}
          tint="purple"
        />
      </KpiGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Reveal className="min-w-0">
          <Card className="h-full">
            <CardHeader
              title="Admission funnel"
              subtitle="Submitted → fee paid → verified → offered → accepted → enrolled"
            />
            <div className="p-5 sm:p-6">
              <Funnel steps={d.funnel} />
            </div>
          </Card>
        </Reveal>
        <Reveal className="min-w-0" delay={0.05}>
          <Card className="h-full">
            <CardHeader
              title="Daily submissions"
              subtitle={`${formatNumber(d.dailySubmissions.reduce((s, x) => s + x.count, 0))} in the last ${days} days (Pakistan time)`}
            />
            <div className="h-72 px-2 pt-4 pb-3">
              <DailyBars data={d.dailySubmissions} label="Applications" />
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-6">
        <Card className="overflow-hidden">
          <CardHeader
            title="Demand per program"
            subtitle="Applications count every preference; applicants count each person once"
          />
          <div className="mt-4">
            <DataTable
              rows={d.programs}
              rowKey={(p) => p.programId}
              empty={
                <EmptyState
                  icon={GraduationCap}
                  title="No programs in this campaign"
                  text="Add programs to a campaign to see demand."
                />
              }
              columns={[
                {
                  key: 'program',
                  header: 'Program',
                  primary: true,
                  cell: (p) => (
                    <span className="text-ink font-semibold">
                      {p.title} <span className="text-muted text-[12px] font-medium">({p.code})</span>
                    </span>
                  ),
                },
                { key: 'seats', header: 'Seats', cell: (p) => formatNumber(p.seats) },
                { key: 'apps', header: 'Applications', cell: (p) => formatNumber(p.applications) },
                { key: 'first', header: 'First choice', cell: (p) => formatNumber(p.firstChoice) },
                { key: 'applicants', header: 'Applicants', cell: (p) => formatNumber(p.applicants) },
                {
                  key: 'perSeat',
                  header: 'Applications per seat',
                  cell: (p) => (
                    <div className="flex min-w-[140px] items-center gap-2.5">
                      <div className="bg-card-soft h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${(p.applicationsPerSeat / maxPerSeat) * 100}%` }}
                        />
                      </div>
                      <span className="text-ink w-10 text-right font-bold tabular-nums">{p.applicationsPerSeat}</span>
                    </div>
                  ),
                },
                { key: 'aps', header: 'Applicants per seat', cell: (p) => p.applicantsPerSeat },
              ]}
            />
          </div>
        </Card>
      </Reveal>

      <Reveal className="mt-6">
        <Card>
          <CardHeader
            title="Reports"
            subtitle="Download for the record, the bank reconciliation or the notice board (RPT-2)"
          />
          <ul className="divide-line grid divide-y px-5 pb-2 sm:px-6 lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:px-0">
            <ReportRow
              icon={FileText}
              title="Applications"
              text={campaignId ? 'Applications of the selected campaign' : 'Applications of every campaign'}
              show={can('applications.review') || can('analytics.view')}
              csv={() => void downloadFile(`/reports/applications.csv${qs}`, 'applications.csv')}
              pdf={() => void openFile(`/reports/applications.pdf${qs}`)}
            />
            <ReportRow
              icon={Banknote}
              title="Payments"
              text="Payment proofs with receipts and decisions"
              show={can('payments.verify') || can('analytics.view')}
              csv={() => void downloadFile('/reports/payments.csv', 'payments.csv')}
              pdf={() => void openFile('/reports/payments.pdf')}
            />
            <li className="flex flex-col gap-3 py-4 lg:px-6">
              <div className="flex items-start gap-3">
                <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <ListOrdered className="size-5" />
                </span>
                <div>
                  <p className="text-ink font-semibold">Merit lists</p>
                  <p className="text-muted text-[12.5px]">CSV, internal PDF (full names) and public PDF of each list</p>
                </div>
              </div>
              {can('merit.manage') || can('merit.publish') ? (
                <ButtonLink href="/institution/merit-lists" size="sm" variant="secondary" className="w-fit">
                  Open merit lists
                </ButtonLink>
              ) : (
                <p className="text-muted text-[12.5px]">Available to the merit committee and the admin.</p>
              )}
            </li>
          </ul>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Reveal className="min-w-0">
          <Card className="h-full">
            <CardHeader title="Fees" subtitle="Collected against the challans issued" />
            <div className="space-y-5 p-5 sm:p-6">
              <Meter
                label="Application fee"
                value={fee(d.fees.application)}
                detail={`${formatMoney(d.fees.application.collected)} of ${formatMoney(d.fees.application.issued)} · ${formatMoney(d.fees.application.outstanding)} outstanding`}
              />
              <Meter
                label="Admission fee"
                value={fee(d.fees.admission)}
                tone="green"
                detail={`${formatMoney(d.fees.admission.collected)} of ${formatMoney(d.fees.admission.issued)} · ${formatMoney(d.fees.admission.outstanding)} outstanding`}
              />
              <dl className="border-line grid grid-cols-3 gap-2 border-t pt-4 text-center">
                {[
                  ['Verified', d.fees.payments.verified],
                  ['Pending', d.fees.payments.pending],
                  ['Rejected', d.fees.payments.rejected],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <dt className="text-muted text-[12px]">{l}</dt>
                    <dd className="text-ink text-[18px] font-bold tabular-nums">{formatNumber(v as number)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
        </Reveal>
        <Reveal className="min-w-0" delay={0.05}>
          <Card className="h-full">
            <CardHeader title="Documents and marks" subtitle="Quality of what applicants submit" />
            <div className="space-y-5 p-5 sm:p-6">
              <Meter
                label="Document rejection rate"
                value={d.documents.rejectionRate}
                tone={d.documents.rejectionRate > 20 ? 'red' : 'amber'}
                detail={`${formatNumber(d.documents.rejected)} rejected of ${formatNumber(d.documents.reviewed)} reviews · ${formatNumber(d.documents.awaitingReview)} awaiting review`}
              />
              <Meter
                label="Verified marks (trust level 2 or higher)"
                value={d.marks.verifiedShare}
                tone="green"
                detail={`${formatNumber(d.marks.verifiedRecords)} of ${formatNumber(d.marks.totalRecords)} current records`}
              />
            </div>
          </Card>
        </Reveal>
        <Reveal className="min-w-0" delay={0.1}>
          <Card className="h-full">
            <CardHeader title="Applications by status" />
            <ul className="divide-line divide-y px-5 pt-3 pb-4 sm:px-6">
              {d.statuses.length ? (
                d.statuses.map((s) => (
                  <li key={s.status} className="flex items-center justify-between gap-3 py-2.5">
                    <StatusBadge status={s.status} />
                    <span className="text-ink font-bold tabular-nums">{formatNumber(s.count)}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted py-6 text-center text-[13px]">No submitted applications yet.</li>
              )}
            </ul>
          </Card>
        </Reveal>
      </div>
    </>
  );
}

function ReportRow({
  icon: Icon,
  title,
  text,
  show,
  csv,
  pdf,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  show: boolean;
  csv: () => void;
  pdf: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 py-4 lg:px-6">
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-ink font-semibold">{title}</p>
          <p className="text-muted text-[12.5px]">{text}</p>
        </div>
      </div>
      {show ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={csv}>
            CSV
          </Button>
          <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={pdf}>
            PDF
          </Button>
        </div>
      ) : (
        <p className="text-muted text-[12.5px]">Your role cannot export this report.</p>
      )}
    </li>
  );
}
