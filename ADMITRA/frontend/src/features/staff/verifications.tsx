'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RecordBadge, TrustChip } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { LEVEL_LABELS, type AcademicRecord } from '@/features/applicant/types';
import { useInstKey } from '@/features/institution/hooks';
import { getPaged } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PageMeta } from '@/lib/types';

type Row = AcademicRecord & { applicantName: string; flagged: boolean };
type TabKey = 'PENDING' | 'UNDER_VERIFICATION' | 'MISMATCH' | 'DECLARED' | 'AUTO_VERIFIED' | 'VERIFIED';

/** MARK-7: records that need an officer decision. */
export function VerificationQueue() {
  const key = useInstKey();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('PENDING');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: key('verifications', tab, page),
    queryFn: () => getPaged<Row>('/verifications', { status: tab === 'PENDING' ? undefined : tab, page }),
  });
  const counts = (list.data?.meta as (PageMeta & { counts?: Record<string, number> }) | undefined)?.counts ?? {};
  const pending = (counts.UNDER_VERIFICATION ?? 0) + (counts.MISMATCH ?? 0) + (counts.DECLARED ?? 0);
  return (
    <>
      <PageHeader
        title="Marks Verification"
        subtitle="Compare entered marks with the board registry and the result card, then decide"
      />
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <Tabs
            value={tab}
            onChange={(v) => (setTab(v), setPage(1))}
            tabs={[
              { value: 'PENDING', label: 'Needs decision', count: pending },
              { value: 'UNDER_VERIFICATION', label: 'Needs officer review', count: counts.UNDER_VERIFICATION ?? 0 },
              { value: 'MISMATCH', label: 'Mismatch', count: counts.MISMATCH ?? 0 },
              { value: 'DECLARED', label: 'Self-declared', count: counts.DECLARED ?? 0 },
              { value: 'AUTO_VERIFIED', label: 'Registry verified', count: counts.AUTO_VERIFIED ?? 0 },
              { value: 'VERIFIED', label: 'Officer verified', count: counts.VERIFIED ?? 0 },
            ]}
          />
        </div>
        <DataTable
          loading={list.isLoading}
          rows={list.data?.data ?? []}
          rowKey={(r) => r._id}
          onRowClick={(r) => router.push(`/institution/verifications/${r._id}`)}
          empty={
            <EmptyState
              icon={ShieldCheck}
              title="Nothing to verify"
              text="Records of applicants who applied here appear in this list."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Applicant',
              primary: true,
              cell: (r) => (
                <span className="text-ink inline-flex items-center gap-1.5 font-semibold">
                  {r.applicantName}
                  {r.flagged && (
                    <AlertTriangle className="size-4 text-red-700 dark:text-red-400" aria-label="Fraud flag" />
                  )}
                </span>
              ),
            },
            { key: 'level', header: 'Qualification', cell: (r) => LEVEL_LABELS[r.level] },
            { key: 'board', header: 'Board / roll no.', cell: (r) => `${r.board} · ${r.rollNo} (${r.year})` },
            { key: 'marks', header: 'Marks', cell: (r) => `${r.obtained}/${r.total} (${r.percentage}%)` },
            { key: 'trust', header: 'Trust', cell: (r) => <TrustChip level={r.trustLevel} /> },
            { key: 'status', header: 'Status', cell: (r) => <RecordBadge status={r.verificationStatus} /> },
            { key: 'upd', header: 'Updated', cell: (r) => formatDateTime(r.updatedAt), hideOnMobile: true },
            {
              key: 'go',
              header: '',
              className: 'text-right',
              cell: (r) => (
                <ButtonLink
                  size="sm"
                  variant="secondary"
                  href={`/institution/verifications/${r._id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                </ButtonLink>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} className="p-4" />
      </Card>
    </>
  );
}
