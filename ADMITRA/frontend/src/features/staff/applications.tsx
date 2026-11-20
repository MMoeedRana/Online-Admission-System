'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, FileText, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MarksBadge, StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { useInstKey } from '@/features/institution/hooks';
import { getPaged } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { PageMeta } from '@/lib/types';
import type { QueueItem } from './types';

type TabKey =
  'ALL' | 'DOCUMENT_VERIFICATION' | 'PAYMENT_PENDING' | 'DEFICIENT' | 'ELIGIBILITY_CHECK' | 'VERIFIED' | 'REJECTED';
const TABS: { value: TabKey; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DOCUMENT_VERIFICATION', label: 'Document verification' },
  { value: 'PAYMENT_PENDING', label: 'Payment pending' },
  { value: 'DEFICIENT', label: 'Deficient' },
  { value: 'ELIGIBILITY_CHECK', label: 'Eligibility check' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function ApplicationsQueue() {
  const sp = useSearchParams();
  const router = useRouter();
  const key = useInstKey();
  const [tab, setTab] = useState<TabKey>((sp.get('status') as TabKey) || 'ALL');
  const [q, setQ] = useState('');
  const [marks, setMarks] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: key('applications', tab, q, marks, page),
    queryFn: () =>
      getPaged<QueueItem>('/applications', {
        status: tab === 'ALL' ? undefined : tab,
        q: q || undefined,
        marks: marks || undefined,
        page,
      }),
  });
  const counts = (list.data?.meta as (PageMeta & { counts?: Record<string, number> }) | undefined)?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const inReview = (counts.DOCUMENT_VERIFICATION ?? 0) + (counts.ELIGIBILITY_CHECK ?? 0) + (counts.UNDER_REVIEW ?? 0);

  return (
    <>
      <PageHeader title="Applications" subtitle="Submitted applications of your admission campaigns" />
      <KpiGrid className="mb-6 grid-cols-2 gap-3 sm:gap-4">
        <KpiCard label="Total submitted" value={formatNumber(total)} icon={Inbox} />
        <KpiCard label="In review" value={formatNumber(inReview)} icon={Clock} tint="purple" />
        <KpiCard
          label="Awaiting applicant"
          value={formatNumber((counts.PAYMENT_PENDING ?? 0) + (counts.DEFICIENT ?? 0))}
          icon={AlertTriangle}
          tint="amber"
        />
        <KpiCard label="Verified" value={formatNumber(counts.VERIFIED ?? 0)} icon={CheckCircle2} tint="green" />
      </KpiGrid>
      <Card className="overflow-hidden">
        <div className="space-y-4 p-4 sm:p-5">
          <Tabs
            value={tab}
            onChange={(v) => (setTab(v), setPage(1))}
            tabs={TABS.map((t) => ({ ...t, count: t.value === 'ALL' ? total : (counts[t.value] ?? 0) }))}
          />
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Input
              value={q}
              onChange={(e) => (setQ(e.target.value), setPage(1))}
              placeholder="Search by application number, name or CNIC"
              aria-label="Search applications"
            />
            <Select value={marks} onChange={(e) => (setMarks(e.target.value), setPage(1))} aria-label="Marks">
              <option value="">All marks states</option>
              <option value="VERIFIED">Marks verified</option>
              <option value="PENDING">Marks pending</option>
              <option value="MISMATCH">Marks mismatch</option>
              <option value="FLAGGED">Fraud flag</option>
            </Select>
          </div>
        </div>
        <DataTable
          loading={list.isLoading}
          rows={list.data?.data ?? []}
          rowKey={(r) => r._id}
          onRowClick={(r) => router.push(`/institution/applications/${r._id}`)}
          empty={<EmptyState icon={FileText} title="No applications" text="Submitted applications appear here." />}
          columns={[
            {
              key: 'applicant',
              header: 'Applicant',
              primary: true,
              cell: (r) => (
                <div>
                  <p className="text-ink font-semibold">{r.applicant.name}</p>
                  <p className="text-muted text-[12px]">{r.applicationNumber}</p>
                </div>
              ),
            },
            { key: 'program', header: 'First preference', cell: (r) => r.programs[0]?.title ?? '-' },
            {
              key: 'marks',
              header: 'Marks',
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  <MarksBadge state={r.marks} />
                  {r.flagged && (
                    <AlertTriangle className="size-4 text-red-700 dark:text-red-400" aria-label="Fraud flag" />
                  )}
                </span>
              ),
            },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'date', header: 'Submitted', cell: (r) => formatDate(r.submittedAt), hideOnMobile: true },
            {
              key: 'go',
              header: '',
              className: 'text-right',
              cell: (r) => (
                <ButtonLink
                  size="sm"
                  variant="secondary"
                  href={`/institution/applications/${r._id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Review
                </ButtonLink>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} className="p-4" />
      </Card>
      <p className="text-muted mt-3 text-[12px]">
        Marks states come from the academic records. Open{' '}
        <Link href="/institution/verifications" className="text-primary font-semibold">
          Marks Verification
        </Link>{' '}
        to decide pending records.
      </p>
    </>
  );
}
