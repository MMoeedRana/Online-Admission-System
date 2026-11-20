'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressRing, toneForStatus } from '@/components/ui/progress-ring';
import { FullPageLoader } from '@/components/ui/spinner';
import { get } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { AppListItem } from './types';

export function ApplicationsList() {
  const apps = useQuery({ queryKey: ['me', 'applications'], queryFn: () => get<AppListItem[]>('/me/applications') });
  if (!apps.data) return <FullPageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="My applications"
        subtitle="All your applications, one per admission campaign."
        actions={
          <ButtonLink href="/programs?openOnly=true" icon={<Plus className="size-4" />}>
            Start new application
          </ButtonLink>
        }
      />
      {apps.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No applications yet"
            text="Find an open program and press Apply now. Your profile and marks are used for every application."
            action={<ButtonLink href="/programs?openOnly=true">Browse open programs</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {apps.data.map((a) => (
            <Link key={a._id} href={`/applicant/applications/${a._id}`} className="group">
              <Card className="group-hover:border-primary/40 flex h-full gap-4 p-5 transition group-hover:shadow-md">
                <ProgressRing value={a.progress} tone={toneForStatus(a.status)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-ink truncate text-[15px] font-bold">{a.institution?.name}</p>
                      <p className="text-muted text-[12.5px]">
                        {a.campaign?.title} · {a.applicationNumber ?? 'Not submitted'}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-body mt-2 line-clamp-2 text-[13px]">
                    {a.programs.join(' · ') || 'No program chosen yet'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-muted">
                      {a.voucher ? `Fee ${formatMoney(a.voucher.amount)} · ` : ''}
                      {a.submittedAt ? `submitted ${formatDate(a.submittedAt)}` : `updated ${formatDate(a.updatedAt)}`}
                    </span>
                    <span className="text-primary inline-flex items-center gap-1 font-semibold">
                      {a.nextAction} <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
