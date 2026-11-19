'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, FileText, MailWarning } from 'lucide-react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage, getPaged, post } from '@/lib/api';
import { daysLeft, formatDate } from '@/lib/format';

interface OpenRow {
  programId: string;
  program: string;
  institution: string;
  city: string;
  campaign: string;
  closesAt: string;
}

export function ApplicantDashboard() {
  const { user } = useAuth();
  const open = useQuery({
    queryKey: ['public', 'open-admissions'],
    queryFn: () => getPaged<OpenRow>('/public/open-admissions', { limit: 6 }),
  });
  const resend = useMutation({
    mutationFn: () => post('/auth/resend-verification'),
    onSuccess: () => toast.success('Verification e-mail sent. Please check your inbox.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const first = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight sm:text-[26px]">Hi {first}</h1>
        <p className="text-muted mt-1 text-[14px]">Here are your applications and the admissions open now.</p>
      </div>

      {user && !user.emailVerified && (
        <Alert tone="warning" title="Please verify your e-mail address">
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span>We sent a link to {user.email}. Verified e-mail is needed to receive admission updates.</span>
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

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="My applications" />
          <EmptyState
            icon={FileText}
            title="You have not applied yet"
            text="Choose a program that is open for admission. Your applications and their progress will appear here."
            action={
              <ButtonLink href="/programs?openOnly=true" icon={<ArrowRight className="size-4" />}>
                Browse open programs
              </ButtonLink>
            }
          />
        </Card>

        <Card>
          <CardHeader
            title="Open admissions"
            subtitle="Programs accepting applications now"
            action={
              <Link href="/programs?openOnly=true" className="text-primary text-[13px] font-semibold">
                View all
              </Link>
            }
          />
          <ul className="divide-line mt-3 divide-y">
            {open.isPending &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-6 py-4">
                  <div className="bg-card-soft h-10 animate-pulse rounded-lg" />
                </li>
              ))}
            {open.data?.data.map((r) => (
              <li key={r.programId + r.campaign}>
                <Link
                  href={`/programs/${r.programId}`}
                  className="hover:bg-card-soft flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate text-[14px] font-semibold">{r.program}</p>
                    <p className="text-muted truncate text-[12.5px]">
                      {r.institution}, {r.city}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                    <CalendarClock className="size-3.5" /> {Math.max(0, daysLeft(r.closesAt))}d
                  </span>
                </Link>
              </li>
            ))}
            {open.data && open.data.data.length === 0 && (
              <li className="text-muted px-6 py-8 text-center text-[13px]">No admissions are open right now.</li>
            )}
          </ul>
          {open.data && open.data.data.length > 0 && (
            <p className="border-line text-muted border-t px-6 py-3 text-[12px]">
              Closing dates are shown on each program, e.g. {formatDate(open.data.data[0]!.closesAt)}.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
