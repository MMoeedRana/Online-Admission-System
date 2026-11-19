'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-context';
import { get } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Campaign } from '@/lib/types';
import { useInstKey } from './hooks';

const TABS = ['', 'DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;
const LABEL: Record<string, string> = {
  '': 'All',
  DRAFT: 'Draft',
  OPEN: 'Open',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

export function CampaignsList() {
  const key = useInstKey();
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = useState<string>('');
  const q = useQuery({ queryKey: key('campaigns'), queryFn: () => get<Campaign[]>('/campaigns') });
  const rows = (q.data ?? []).filter((c) => !status || c.status === status);
  return (
    <>
      <PageHeader
        title="Admission campaigns"
        subtitle="Which programs accept applications, for which session and between which dates"
        actions={
          can('campaigns.manage') ? (
            <ButtonLink href="/institution/campaigns/new" icon={<Plus className="size-4" />}>
              New campaign
            </ButtonLink>
          ) : undefined
        }
      />
      <Tabs
        className="mb-4"
        value={status}
        onChange={setStatus}
        tabs={TABS.map((t) => ({
          value: t,
          label: LABEL[t]!,
          count: (q.data ?? []).filter((c) => !t || c.status === t).length,
        }))}
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={q.isPending}
          rows={rows}
          rowKey={(c) => c._id}
          onRowClick={(c) => router.push(`/institution/campaigns/${c._id}`)}
          empty={
            <EmptyState
              icon={CalendarRange}
              title="No campaigns"
              text="Create a campaign and add the programs that accept applications."
            />
          }
          columns={[
            {
              key: 'title',
              header: 'Campaign',
              primary: true,
              cell: (c) => (
                <div>
                  <p className="text-ink font-semibold">{c.title}</p>
                  <p className="text-muted text-[12px]">{c.code}</p>
                </div>
              ),
            },
            {
              key: 'session',
              header: 'Session',
              cell: (c) => (typeof c.sessionId === 'object' ? c.sessionId.name : '-'),
            },
            { key: 'programs', header: 'Programs', cell: (c) => c.programs.length },
            { key: 'opens', header: 'Opens', cell: (c) => formatDate(c.opensAt) },
            { key: 'closes', header: 'Closes', cell: (c) => formatDate(c.closesAt) },
            { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
      </Card>
    </>
  );
}
