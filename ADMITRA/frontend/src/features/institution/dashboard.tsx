'use client';

import { useQuery } from '@tanstack/react-query';
import { Building, CalendarRange, GraduationCap, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { useAuth } from '@/features/auth/auth-context';
import { get } from '@/lib/api';
import { DEGREE_LEVELS } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active programs"
          value={formatNumber(d.kpis.programs)}
          sub={`${d.kpis.departments} departments`}
          icon={GraduationCap}
        />
        <KpiCard
          label="Total seats"
          value={formatNumber(d.kpis.seats)}
          sub="Across all shifts"
          icon={Building}
          tint="green"
        />
        <KpiCard
          label="Open campaigns"
          value={formatNumber(d.kpis.openCampaigns)}
          sub={`${d.campaigns.length} campaign(s) in total`}
          icon={CalendarRange}
          tint="amber"
        />
        <KpiCard
          label="Staff members"
          value={formatNumber(d.kpis.staff)}
          sub="Active accounts"
          icon={Users}
          tint="purple"
        />
      </div>
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
                  <Bar dataKey="seats" name="Seats" fill="#1F6FEB" radius={[8, 8, 0, 0]} maxBarSize={48} />
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
          title="Recently added programs"
          action={
            <Link href="/institution/programs" className="text-primary text-[13px] font-semibold">
              See all
            </Link>
          }
        />
        <div className="mt-4">
          <DataTable
            rows={d.recentPrograms}
            rowKey={(p) => p.id}
            empty={<EmptyState icon={GraduationCap} title="No programs yet" />}
            columns={[
              {
                key: 'title',
                header: 'Program',
                primary: true,
                cell: (p) => (
                  <Link href={`/institution/programs/${p.id}`} className="text-ink hover:text-primary font-semibold">
                    {p.title}
                  </Link>
                ),
              },
              { key: 'code', header: 'Code', cell: (p) => p.code },
              {
                key: 'level',
                header: 'Degree',
                cell: (p) => DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] ?? p.degreeLevel,
              },
              { key: 'dept', header: 'Department', cell: (p) => p.department },
              { key: 'seats', header: 'Seats', cell: (p) => p.seats },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
