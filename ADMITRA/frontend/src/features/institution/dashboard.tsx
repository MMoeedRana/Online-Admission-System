'use client';

import { useQuery } from '@tanstack/react-query';
import { Banknote, CalendarRange, FileText, GraduationCap, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MarksBadge, StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { BriefingCard } from '@/features/mitra/mitra-page';
import { useAuth } from '@/features/auth/auth-context';
import { get } from '@/lib/api';
import { DEGREE_LEVELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useInstKey } from './hooks';

interface Dash {
  kpis: { programs: number; seats: number; openCampaigns: number; staff: number; departments: number };
  currentSession: string | null;
  seatsByLevel: { level: string; seats: number }[];
  campaigns: {
    id: string;
    title: string;
    code: string;
    status: string;
    opensAt: string;
    closesAt: string;
    programs: number;
  }[];
  applications: {
    submitted: number;
    verifiedRecords: number;
    totalRecords: number;
    feeCollected: number;
    paymentsVerified: number;
    verified: number;
  };
  recentApplications: {
    id: string;
    applicationNumber: string;
    applicant: string;
    program: string;
    status: string;
    marks: string;
  }[];
  recentPrograms: { id: string; title: string; code: string; degreeLevel: string; seats: number; department: string }[];
}

export function InstitutionDashboard() {
  const key = useInstKey();
  const { current, can } = useAuth();
  const q = useQuery({ queryKey: key('dashboard'), queryFn: () => get<Dash>('/institution/dashboard') });
  if (!q.data) return <FullPageLoader />;
  const d = q.data;
  const chart = d.seatsByLevel.map((s) => ({
    name: DEGREE_LEVELS[s.level as keyof typeof DEGREE_LEVELS] ?? s.level,
    seats: s.seats,
  }));
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${current?.name}${d.currentSession ? ` · Session ${d.currentSession}` : ''}`}
        actions={
          can('campaigns.manage') ? (
            <ButtonLink href="/institution/campaigns/new" icon={<Plus className="size-4" />}>
              New campaign
            </ButtonLink>
          ) : undefined
        }
      />
      <KpiGrid>
        <KpiCard
          label="Applications"
          value={formatNumber(d.applications.submitted)}
          sub={`${d.applications.verified} verified`}
          icon={FileText}
        />
        <KpiCard
          label="Marks verified"
          value={
            d.applications.totalRecords
              ? `${Math.round((d.applications.verifiedRecords / d.applications.totalRecords) * 100)}%`
              : '-'
          }
          sub={`${d.applications.verifiedRecords} of ${d.applications.totalRecords} records`}
          icon={ShieldCheck}
          tint="green"
        />
        <KpiCard
          label="Fee collected"
          value={formatMoney(d.applications.feeCollected)}
          sub={`${d.applications.paymentsVerified} verified payment(s)`}
          icon={Banknote}
          tint="amber"
        />
        <KpiCard
          label="Seats offered"
          value={formatNumber(d.kpis.seats)}
          sub={`${d.kpis.programs} programs · ${d.kpis.openCampaigns} open campaign(s)`}
          icon={GraduationCap}
          tint="purple"
        />
      </KpiGrid>
      {current?.ai?.copilot || current?.ai?.briefing ? (
        <div className="mt-6">
          <BriefingCard scope="institution" compact />
        </div>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Admission campaigns"
            action={
              <Link href="/institution/campaigns" className="text-primary text-[13px] font-semibold">
                See all
              </Link>
            }
          />
          <div className="mt-4">
            <DataTable
              rows={d.campaigns}
              rowKey={(c) => c.id}
              empty={
                <EmptyState
                  icon={CalendarRange}
                  title="No campaigns yet"
                  text="Create a campaign to open admissions for your programs."
                />
              }
              columns={[
                {
                  key: 'title',
                  header: 'Campaign',
                  primary: true,
                  cell: (c) => (
                    <Link href={`/institution/campaigns/${c.id}`} className="text-ink hover:text-primary font-semibold">
                      {c.title} <span className="text-muted text-[12px] font-medium">({c.code})</span>
                    </Link>
                  ),
                },
                { key: 'programs', header: 'Programs', cell: (c) => c.programs },
                { key: 'closes', header: 'Closes', cell: (c) => formatDate(c.closesAt) },
                { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Seats by degree level" />
          <div className="h-64 px-2 pt-4 pb-3">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -16, right: 10 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--card-soft)' }}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12 }}
                  />
                  <Bar dataKey="seats" name="Seats" fill="var(--primary)" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted pt-16 text-center text-[13px]">Add programs to see seats here.</p>
            )}
          </div>
        </Card>
      </div>
      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Recent applications"
          action={
            can('applications.review') ? (
              <Link href="/institution/applications" className="text-primary text-[13px] font-semibold">
                See all
              </Link>
            ) : undefined
          }
        />
        <div className="mt-4">
          <DataTable
            rows={d.recentApplications}
            rowKey={(a) => a.id}
            empty={
              <EmptyState icon={FileText} title="No applications yet" text="Submitted applications appear here." />
            }
            columns={[
              {
                key: 'applicant',
                header: 'Applicant',
                primary: true,
                cell: (a) =>
                  can('applications.review') ? (
                    <Link
                      href={`/institution/applications/${a.id}`}
                      className="text-ink hover:text-primary font-semibold"
                    >
                      {a.applicant}
                    </Link>
                  ) : (
                    <span className="text-ink font-semibold">{a.applicant}</span>
                  ),
              },
              { key: 'no', header: 'Application no.', cell: (a) => a.applicationNumber },
              { key: 'program', header: 'Program', cell: (a) => a.program },
              { key: 'marks', header: 'Marks', cell: (a) => <MarksBadge state={a.marks} /> },
              { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
