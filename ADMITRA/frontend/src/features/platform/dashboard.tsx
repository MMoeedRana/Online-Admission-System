'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarRange, Clock, GraduationCap, UserRound } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { get } from '@/lib/api';
import { INSTITUTION_TYPES } from '@/lib/constants';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

interface Dashboard {
  counts: Record<string, number>;
  applicants: number;
  staff: number;
  programs: number;
  openCampaigns: number;
  pending: {
    _id: string;
    name: string;
    city: string;
    province: string;
    type: keyof typeof INSTITUTION_TYPES;
    contact: { name: string };
    createdAt: string;
  }[];
  recentActivity: AuditEntry[];
  expiring: { id: string; name: string; endsAt: string; state: string }[];
  planUsage: { name: string; count: number }[];
}

export function humanAction(a: string) {
  return a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function PlatformDashboard() {
  const q = useQuery({ queryKey: ['platform', 'dashboard'], queryFn: () => get<Dashboard>('/platform/dashboard') });
  if (!q.data) return <FullPageLoader />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="The ADMITRA platform at a glance" />
      <KpiGrid>
        <KpiCard
          label="Active institutions"
          value={formatNumber(d.counts.ACTIVE)}
          sub={`${d.counts.PENDING} pending request(s)`}
          icon={Building2}
        />
        <KpiCard
          label="Programs"
          value={formatNumber(d.programs)}
          sub={`${d.openCampaigns} open campaign(s)`}
          icon={GraduationCap}
          tint="green"
        />
        <KpiCard
          label="Applicants"
          value={formatNumber(d.applicants)}
          sub="Registered accounts"
          icon={UserRound}
          tint="amber"
        />
        <KpiCard
          label="Staff members"
          value={formatNumber(d.staff)}
          sub={`${d.counts.SUSPENDED} suspended institution(s)`}
          icon={CalendarRange}
          tint="purple"
        />
      </KpiGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Onboarding requests"
            subtitle="Institutions waiting for approval"
            action={
              <ButtonLink href="/platform/institutions?status=PENDING" size="sm" variant="secondary">
                View all
              </ButtonLink>
            }
          />
          <ul className="divide-line mt-3 divide-y">
            {d.pending.length === 0 && (
              <li className="text-muted px-6 py-8 text-center text-[13px]">No pending requests.</li>
            )}
            {d.pending.map((p) => (
              <li key={p._id}>
                <Link
                  href={`/platform/institutions/${p._id}`}
                  className="hover:bg-card-soft flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate font-semibold">{p.name}</p>
                    <p className="text-muted truncate text-[12.5px]">
                      {INSTITUTION_TYPES[p.type]} · {p.city} · {p.contact.name}
                    </p>
                  </div>
                  <span className="text-muted shrink-0 text-[12px]">{formatDate(p.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Institutions per plan" />
          <div className="h-64 px-2 pt-4 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.planUsage} margin={{ left: -20, right: 10 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--card-soft)' }}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12 }}
                />
                <Bar dataKey="count" name="Institutions" fill="#1F6FEB" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Subscriptions ending soon" subtitle="Ending in the next 14 days or already ended" />
          <ul className="divide-line mt-3 divide-y">
            {d.expiring.length === 0 && (
              <li className="text-muted px-6 py-8 text-center text-[13px]">
                No subscription ends in the next 14 days.
              </li>
            )}
            {d.expiring.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/platform/institutions/${e.id}`}
                  className="hover:bg-card-soft flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
                >
                  <span className="text-ink font-semibold">{e.name}</span>
                  <span className="text-muted flex items-center gap-2 text-[12.5px]">
                    {formatDate(e.endsAt)} <StatusBadge status={e.state} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title="Recent activity"
            subtitle="From the platform audit log"
            action={
              <Link href="/platform/audit-log" className="text-primary text-[13px] font-semibold">
                Open audit log
              </Link>
            }
          />
          <ul className="divide-line mt-3 divide-y">
            {d.recentActivity.map((a) => (
              <li key={a._id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                <Clock className="text-muted mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-ink text-[13.5px]">
                    <b>{humanAction(a.action)}</b> · {a.entity}
                  </p>
                  <p className="text-muted text-[12px]">
                    {a.actorName || 'System'} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
