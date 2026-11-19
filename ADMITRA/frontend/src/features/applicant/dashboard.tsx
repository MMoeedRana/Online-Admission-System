'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, FileText, MailWarning, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { RecordBadge, StatusBadge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressRing, toneForStatus } from '@/components/ui/progress-ring';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage, get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { LEVEL_LABELS, type AcademicRecord, type AppListItem } from './types';

const ATTENTION = ['DRAFT', 'PAYMENT_PENDING', 'DEFICIENT'];
const REVIEW = ['UNDER_REVIEW', 'DOCUMENT_VERIFICATION', 'ELIGIBILITY_CHECK', 'VERIFIED'];

export function ApplicantDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'all' | 'review' | 'attention'>('all');
  const apps = useQuery({ queryKey: ['me', 'applications'], queryFn: () => get<AppListItem[]>('/me/applications') });
  const dash = useQuery({
    queryKey: ['me', 'dashboard'],
    queryFn: () =>
      get<{ hasProfile: boolean; records: AcademicRecord[]; notifications: AppNotification[] }>('/me/dashboard'),
  });
  const resend = useMutation({
    mutationFn: () => post('/auth/resend-verification'),
    onSuccess: () => toast.success('Verification e-mail sent. Please check your inbox.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!apps.data || !dash.data) return <FullPageLoader />;
  const first = user?.fullName.split(' ')[0] ?? '';
  const list = apps.data.filter((a) =>
    tab === 'all' ? true : tab === 'review' ? REVIEW.includes(a.status) : ATTENTION.includes(a.status),
  );
  const campaigns = [...new Set(apps.data.map((a) => a.campaign?.title).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight sm:text-[24px]">
            Hi {first}, here are your applications
          </h1>
          <p className="text-muted mt-1 text-[13.5px]">
            {campaigns.length ? `${campaigns.join(', ')} admissions` : 'No applications yet'} · {apps.data.length}{' '}
            application{apps.data.length === 1 ? '' : 's'}
          </p>
        </div>
        <ButtonLink href="/programs?openOnly=true" icon={<Plus className="size-4" />}>
          Start new application
        </ButtonLink>
      </div>

      {user && !user.emailVerified && (
        <Alert tone="warning" title="Please verify your e-mail address">
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span>We sent a link to {user.email}. A verified e-mail is needed to receive admission updates.</span>
            <Button
              size="sm"
              variant="secondary"
              icon={<MailWarning className="size-4" />}
              loading={resend.isPending}
              onClick={() => resend.mutate()}
            >
              Resend link
            </Button>
          </div>
        </Alert>
      )}
      {!dash.data.hasProfile && (
        <Alert tone="info" title="Complete your profile and marks first">
          Your CNIC, address and academic record are needed for every application.{' '}
          <Link href="/applicant/profile" className="font-semibold underline">
            Complete profile
          </Link>
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'All applications' },
          { value: 'review', label: 'Under review' },
          {
            value: 'attention',
            label: 'Needs attention',
            count: apps.data.filter((a) => ATTENTION.includes(a.status)).length,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {list.length === 0 && (
            <Card>
              <EmptyState
                icon={FileText}
                title={apps.data.length ? 'Nothing here' : 'You have not applied yet'}
                text="Choose a program that is open for admission. Your applications and their progress will appear here."
                action={
                  <ButtonLink href="/programs?openOnly=true" icon={<ArrowRight className="size-4" />}>
                    Browse open programs
                  </ButtonLink>
                }
              />
            </Card>
          )}
          {list.map((a) => (
            <Card key={a._id} className="flex items-center gap-4 p-4 sm:p-5">
              <ProgressRing value={a.progress} tone={toneForStatus(a.status)} />
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-[15px] font-bold">{a.institution?.name}</p>
                <p className="text-muted truncate text-[13px]">
                  {a.programs.join(', ') || 'No program chosen'}
                  {a.applicationNumber ? ` · ${a.applicationNumber}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={a.status} />
                  <span className="text-muted text-[12.5px]">{a.nextAction}</span>
                </div>
              </div>
              <ButtonLink href={`/applicant/applications/${a._id}`} variant="secondary" size="sm">
                Open
              </ButtonLink>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Marks verification"
              action={
                <Link href="/applicant/records" className="text-primary text-[13px] font-semibold">
                  Manage
                </Link>
              }
            />
            <ul className="divide-line mt-3 divide-y">
              {dash.data.records.length === 0 && (
                <li className="text-muted px-6 py-6 text-[13px]">Add your Matric and Intermediate results.</li>
              )}
              {dash.data.records.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <div>
                    <p className="text-ink text-[13.5px] font-semibold">
                      {LEVEL_LABELS[r.level]?.split(' /')[0]} {r.year}
                    </p>
                    <p className="text-muted text-[12px]">{r.percentage}%</p>
                  </div>
                  <RecordBadge status={r.verificationStatus} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader
              title="Notifications"
              action={
                <Link href="/notifications" className="text-primary text-[13px] font-semibold">
                  View all
                </Link>
              }
            />
            <ul className="mt-3 space-y-1 px-3 pb-3">
              {dash.data.notifications.length === 0 && (
                <li className="text-muted flex items-center gap-2 px-3 py-4 text-[13px]">
                  <Bell className="size-4" /> No notifications yet
                </li>
              )}
              {dash.data.notifications.map((n) => (
                <li key={n._id}>
                  <Link
                    href={n.link || '/notifications'}
                    className="hover:bg-card-soft flex gap-3 rounded-xl px-3 py-2.5"
                  >
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-line' : 'bg-primary'}`} />
                    <span className="min-w-0">
                      <span className="text-ink block text-[13px] font-semibold">{n.title}</span>
                      <span className="text-muted block text-[11.5px]">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
