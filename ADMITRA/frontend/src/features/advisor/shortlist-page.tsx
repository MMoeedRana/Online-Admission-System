'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Download, GitCompare, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BandBadge, ChanceRing } from './band';
import type { AdvisorResult, DirInstitution, DirProgram } from './types';

interface Item {
  _id: string;
  note: string;
  program: DirProgram;
  institution: DirInstitution;
  advice: AdvisorResult | null;
}

export function ShortlistPage() {
  const qc = useQueryClient();
  const [pick, setPick] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ['me', 'shortlist', 'full'],
    queryFn: async () =>
      (await api.get<{ data: Item[]; meta: { basis: string; hasMarks: boolean } }>('/me/shortlist')).data,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/me/shortlist/${id}`),
    onSuccess: () => {
      toast.success('Removed from your shortlist.');
      void qc.invalidateQueries({ queryKey: ['me', 'shortlist'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!q.data) return <FullPageLoader />;
  const items = q.data.data;
  const toggle = (id: string) =>
    setPick((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length >= 4
          ? (toast.error('Choose up to four programs.'), p)
          : [...p, id],
    );
  return (
    <>
      <PageHeader
        title="My shortlist"
        subtitle={
          q.data.meta.basis === 'VERIFIED'
            ? 'Chances based on your verified marks'
            : 'Chances based on your self-declared marks'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`/applicant/compare?ids=${pick.join(',')}`}
              variant="secondary"
              icon={<GitCompare className="size-4" />}
              aria-disabled={pick.length < 2}
              className={cn(pick.length < 2 && 'pointer-events-none opacity-50')}
            >
              Compare ({pick.length})
            </ButtonLink>
            <Button
              icon={<Download className="size-4" />}
              disabled={!items.length}
              onClick={() => void downloadFile('/me/shortlist/pdf', 'shortlist.pdf')}
            >
              PDF
            </Button>
          </div>
        }
      />
      {!q.data.meta.hasMarks && (
        <Alert tone="info" className="mb-5">
          Add your Matric and Intermediate results in{' '}
          <Link href="/applicant/records" className="font-semibold underline">
            Profile &amp; Marks
          </Link>{' '}
          to see your chances.
        </Alert>
      )}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bookmark}
            title="Your shortlist is empty"
            text="Save programs from the Admission Advisor or the directory to compare them later."
            action={<ButtonLink href="/applicant/advisor">Open the Admission Advisor</ButtonLink>}
          />
        </Card>
      ) : (
        <Stagger className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" gap={0.05}>
          {items.map((i) => (
            <StaggerItem key={i._id} hover className="h-full min-w-0">
              <Card
                className={cn(
                  'flex h-full flex-col p-5 transition-shadow hover:shadow-lg',
                  pick.includes(i.program._id) && 'border-primary',
                )}
              >
                <div className="flex items-start gap-4">
                  <ChanceRing
                    chance={i.advice?.prediction?.chance ?? null}
                    band={i.advice?.band ?? 'INSUFFICIENT_DATA'}
                  />
                  <div className="min-w-0 flex-1">
                    {i.advice && <BandBadge band={i.advice.band} />}
                    <Link
                      href={`/applicant/advisor/${i.program._id}?saved=1`}
                      className="text-ink hover:text-primary mt-2 block text-[15.5px] font-bold"
                    >
                      {i.program.title}
                    </Link>
                    <p className="text-muted truncate text-[13px]">
                      {i.institution.name} · {i.institution.city}
                    </p>
                  </div>
                </div>
                {i.note && <p className="bg-card-soft text-body mt-3 rounded-xl px-3 py-2 text-[12.5px]">{i.note}</p>}
                <div className="text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                  <span>{formatMoney(i.program.feePerSemester)} / semester</span>
                  {i.advice?.lastClosing != null && <span>Last closing {i.advice.lastClosing.toFixed(2)}</span>}
                  {i.advice && <span>Your aggregate {i.advice.aggregate.toFixed(2)}</span>}
                  {i.advice?.openCampaign && <Badge tone="green">Admissions open</Badge>}
                </div>
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <button
                    onClick={() => toggle(i.program._id)}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold',
                      pick.includes(i.program._id)
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line text-body hover:bg-card-soft',
                    )}
                  >
                    <GitCompare className="size-4" /> {pick.includes(i.program._id) ? 'Selected' : 'Select'}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-4 text-red-700 dark:text-red-400" />}
                    onClick={() => remove.mutate(i._id)}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}
