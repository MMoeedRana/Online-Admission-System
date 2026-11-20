'use client';

import { useQuery } from '@tanstack/react-query';
import { Compass, Database, LifeBuoy, Users } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { Reveal } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { get } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { DailyBars, Meter } from './charts';

interface PlatformAnalytics {
  days: number;
  generatedAt: string;
  advisor: {
    runs: number;
    signedInShare: number;
    averagePerDay: number;
    daily: { date: string; count: number }[];
    byField: { name: string; count: number }[];
    byLevel: { name: string; count: number }[];
    bands: Record<string, number>;
    topPrograms: {
      id: string;
      title: string;
      institution: string;
      appearances: number;
      safe: number;
      target: number;
      reach: number;
    }[];
  };
  registry: {
    checks: number;
    matched: number;
    mismatched: number;
    notFound: number;
    matchRate: number;
    mismatchRate: number;
    notFoundRate: number;
    boards: {
      board: string;
      checks: number;
      matched: number;
      mismatched: number;
      notFound: number;
      matchRate: number;
    }[];
  };
  activity: {
    activeInstitutions: number;
    applications: number;
    applicationsByInstitution: { name: string; count: number }[];
    tickets: Record<string, number>;
    ticketResponseOnTime: number;
  };
}

function BarList({ rows, empty }: { rows: { name: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="text-muted py-6 text-center text-[13px]">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(90px,140px)_1fr_48px] items-center gap-3 text-[13px]">
          <span className="text-ink truncate font-medium" title={r.name}>
            {r.name}
          </span>
          <span className="bg-card-soft h-2.5 overflow-hidden rounded-full">
            <span className="bg-primary block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-ink text-right font-bold tabular-nums">{formatNumber(r.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PlatformAnalyticsPage() {
  const [days, setDays] = useState<'14' | '30' | '90'>('30');
  const q = useQuery({
    queryKey: ['platform', 'analytics', days],
    queryFn: () => get<PlatformAnalytics>('/platform/analytics', { days }),
    placeholderData: (p) => p,
  });
  if (!q.data) return <FullPageLoader />;
  const d = q.data;
  const ticketsTotal = Object.values(d.activity.tickets).reduce((s, n) => s + n, 0);
  return (
    <>
      <PageHeader
        title="Platform analytics"
        subtitle={`Admission Advisor usage and registry match rates · updated ${formatDateTime(d.generatedAt)}`}
        actions={
          <Tabs
            value={days}
            onChange={setDays}
            tabs={[
              { value: '14', label: '14 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
            ]}
          />
        }
      />
      <KpiGrid>
        <KpiCard
          label="Advisor runs"
          value={formatNumber(d.advisor.runs)}
          sub={`${d.advisor.averagePerDay} per day · ${d.advisor.signedInShare}% signed in`}
          icon={Compass}
        />
        <KpiCard
          label="Registry match rate"
          value={`${d.registry.matchRate}%`}
          sub={`${formatNumber(d.registry.checks)} automatic checks`}
          icon={Database}
          tint="green"
        />
        <KpiCard
          label="Applications submitted"
          value={formatNumber(d.activity.applications)}
          sub={`${d.activity.activeInstitutions} active institutions`}
          icon={Users}
          tint="purple"
        />
        <KpiCard
          label="Support response on time"
          value={`${d.activity.ticketResponseOnTime}%`}
          sub={`${ticketsTotal} ticket(s) opened in the period`}
          icon={LifeBuoy}
          tint="amber"
        />
      </KpiGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Reveal className="min-w-0">
          <Card className="h-full">
            <CardHeader title="Advisor runs per day" subtitle="Anonymous usage: rounded marks, no identity (PRED-12)" />
            <div className="h-72 px-2 pt-4 pb-3">
              <DailyBars data={d.advisor.daily} label="Runs" />
            </div>
          </Card>
        </Reveal>
        <Reveal className="min-w-0" delay={0.05}>
          <Card className="h-full">
            <CardHeader title="Fields searched" subtitle="Field group chosen in the advisor" />
            <div className="p-5 sm:p-6">
              <BarList rows={d.advisor.byField.slice(0, 8)} empty="No advisor runs in this period." />
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-6">
        <Card className="overflow-hidden">
          <CardHeader
            title="Advisor usage by program"
            subtitle="How often each program appeared in advisor results, and how the chance was rated"
          />
          <div className="mt-4">
            <DataTable
              rows={d.advisor.topPrograms}
              rowKey={(p) => p.id}
              empty={
                <EmptyState
                  icon={Compass}
                  title="No advisor results yet"
                  text="Programs appear once students use the advisor."
                />
              }
              columns={[
                {
                  key: 'program',
                  header: 'Program',
                  primary: true,
                  cell: (p) => (
                    <span className="text-ink font-semibold">
                      {p.title} <span className="text-muted text-[12px] font-medium">{p.institution}</span>
                    </span>
                  ),
                },
                { key: 'n', header: 'Shown in results', cell: (p) => formatNumber(p.appearances) },
                { key: 'safe', header: 'Rated safe', cell: (p) => formatNumber(p.safe) },
                { key: 'target', header: 'Rated target', cell: (p) => formatNumber(p.target) },
                { key: 'reach', header: 'Reach or unlikely', cell: (p) => formatNumber(p.reach) },
              ]}
            />
          </div>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Reveal className="min-w-0">
          <Card className="h-full">
            <CardHeader
              title="Registry checks"
              subtitle="Automatic comparison of entered marks with official results (MARK-4)"
            />
            <div className="space-y-5 p-5 sm:p-6">
              <Meter
                label="Matched"
                value={d.registry.matchRate}
                tone="green"
                detail={`${formatNumber(d.registry.matched)} records verified automatically`}
              />
              <Meter
                label="Mismatch"
                value={d.registry.mismatchRate}
                tone="red"
                detail={`${formatNumber(d.registry.mismatched)} records differ from the official result`}
              />
              <Meter
                label="Not in the registry"
                value={d.registry.notFoundRate}
                tone="amber"
                detail={`${formatNumber(d.registry.notFound)} records sent to an officer`}
              />
            </div>
          </Card>
        </Reveal>
        <Reveal className="min-w-0" delay={0.05}>
          <Card className="h-full overflow-hidden">
            <CardHeader title="Match rate by board" />
            <div className="mt-4">
              <DataTable
                rows={d.registry.boards}
                rowKey={(b) => b.board}
                empty={
                  <EmptyState
                    icon={Database}
                    title="No checks yet"
                    text="Checks run when applicants add academic records."
                  />
                }
                columns={[
                  {
                    key: 'board',
                    header: 'Board',
                    primary: true,
                    cell: (b) => <span className="text-ink font-semibold">{b.board}</span>,
                  },
                  { key: 'checks', header: 'Checks', cell: (b) => formatNumber(b.checks) },
                  { key: 'mm', header: 'Mismatch', cell: (b) => formatNumber(b.mismatched) },
                  { key: 'nf', header: 'Not found', cell: (b) => formatNumber(b.notFound) },
                  {
                    key: 'rate',
                    header: 'Match rate',
                    cell: (b) => (
                      <div className="flex min-w-[120px] items-center gap-2.5">
                        <div className="bg-card-soft h-2 flex-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-green-600 dark:bg-green-500"
                            style={{ width: `${b.matchRate}%` }}
                          />
                        </div>
                        <span className="text-ink w-12 text-right font-bold tabular-nums">{b.matchRate}%</span>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-6">
        <Card>
          <CardHeader title="Applications by institution" subtitle={`Submitted in the last ${d.days} days`} />
          <div className="p-5 sm:p-6">
            <BarList rows={d.activity.applicationsByInstitution} empty="No applications in this period." />
          </div>
        </Card>
      </Reveal>
    </>
  );
}
