'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, GitCompare, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { get } from '@/lib/api';
import { DEGREE_LEVELS } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import { useCompare } from './advisor-page';
import type { DirInstitution, DirProgram, HistoryRow, ProgramSummary } from './types';

type Row = ProgramSummary & { program: DirProgram; institution: DirInstitution; history: HistoryRow[] };

const LABEL: Record<string, string> = {
  MATRIC: 'Matric',
  INTERMEDIATE: 'Intermediate',
  ENTRY_TEST: 'Entry test',
  BACHELOR_16: "Bachelor's",
};

/** DIR-6 / PRED-10: up to four programs side by side. */
export function ComparePage({ base = '' }: { base?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const compare = useCompare();
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
  const q = useQuery({
    queryKey: ['compare', ids.join(',')],
    queryFn: () => get<Row[]>('/public/directory/compare', { ids: ids.join(',') }),
    enabled: ids.length > 0,
  });
  const remove = (id: string) => {
    const next = ids.filter((x) => x !== id);
    if (compare.ids.includes(id)) compare.toggle(id);
    router.replace(next.length ? `${base}/compare?ids=${next.join(',')}` : `${base}/compare`);
  };
  if (!ids.length)
    return (
      <Card>
        <EmptyState
          icon={GitCompare}
          title="Nothing to compare yet"
          text="Choose up to four programs in the Admission Advisor or the directory."
          action={<ButtonLink href={`${base}/advisor`}>Open the Admission Advisor</ButtonLink>}
        />
      </Card>
    );
  if (!q.data) return <FullPageLoader />;
  const rows: { label: string; cell: (r: Row) => React.ReactNode }[] = [
    {
      label: 'Institution',
      cell: (r) => (
        <Link href={`/directory/institutions/${r.institution.slug}`} className="hover:text-primary font-semibold">
          {r.institution.name}
        </Link>
      ),
    },
    { label: 'City', cell: (r) => `${r.institution.city}, ${r.institution.province}` },
    { label: 'Sector', cell: (r) => (r.institution.sector === 'PUBLIC' ? 'Public' : 'Private') },
    {
      label: 'Degree',
      cell: (r) =>
        `${DEGREE_LEVELS[r.program.degreeLevel as keyof typeof DEGREE_LEVELS] ?? r.program.degreeLevel}, ${r.program.durationYears} years`,
    },
    {
      label: 'Fee per semester',
      cell: (r) => <span className="font-semibold">{formatMoney(r.program.feePerSemester)}</span>,
    },
    { label: 'Seats', cell: (r) => r.program.seats || '-' },
    { label: 'Shifts', cell: (r) => r.program.shifts.map((s) => s.toLowerCase()).join(', ') },
    {
      label: 'Last closing merit',
      cell: (r) => (
        <span>
          <b className="text-ink text-[16px]">{r.lastClosing?.toFixed(2) ?? '-'}</b>
          {r.dataYear && <span className="text-muted"> ({r.dataYear})</span>}
        </span>
      ),
    },
    {
      label: 'Closing merit by year',
      cell: (r) => {
        const years = [...new Set(r.history.map((h) => h.year))].slice(0, 3);
        return years.length ? (
          <ul className="space-y-0.5">
            {years.map((y) => (
              <li key={y} className="tabular-nums">
                {y}: {Math.min(...r.history.filter((h) => h.year === y).map((h) => h.closingMerit)).toFixed(2)}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">No verified data</span>
        );
      },
    },
    {
      label: 'Merit formula',
      cell: (r) =>
        r.program.formula.length ? (
          r.program.formula.map((f) => `${LABEL[f.component] ?? f.component} ${f.weight}%`).join(' + ')
        ) : (
          <span className="text-muted">Not published</span>
        ),
    },
    {
      label: 'Eligibility',
      cell: (r) =>
        r.program.eligibility.map((e) => (
          <p key={e.level}>
            {LABEL[e.level] ?? e.level} {e.minPercentage}%{e.groups.length ? ` (${e.groups.join(', ')})` : ''}
          </p>
        )),
    },
    {
      label: 'Data status',
      cell: (r) => (
        <Badge tone={r.dataStatus === 'VERIFIED' ? 'green' : r.dataStatus === 'DRAFT' ? 'amber' : 'gray'}>
          {r.dataStatus === 'VERIFIED' ? 'Verified' : r.dataStatus === 'DRAFT' ? 'Draft' : 'No data'}
        </Badge>
      ),
    },
    {
      label: 'Admissions',
      cell: (r) =>
        r.openCampaign ? (
          <ButtonLink
            size="sm"
            href={`/applicant/apply?campaign=${r.openCampaign.campaignId}&program=${r.program.programId}`}
          >
            Apply by {formatDate(r.openCampaign.closesAt)}
          </ButtonLink>
        ) : r.program.applyUrl ? (
          <a
            href={r.program.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 font-semibold"
          >
            Official website <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <span className="text-muted">Not open on ADMITRA</span>
        ),
    },
  ];
  return (
    <>
      <PageHeader title="Compare programs" subtitle="Figures are indicative; always check the official source." />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead>
              <tr>
                <th className="bg-card-soft border-line w-44 border-b px-5 py-4" />
                {q.data.map((r) => (
                  <th key={r.program._id} className="border-line border-b border-l px-5 py-4 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-ink text-[15px] font-bold">{r.program.title}</p>
                      <button
                        onClick={() => remove(r.program._id)}
                        aria-label={`Remove ${r.program.title}`}
                        className="text-muted hover:text-ink rounded p-0.5"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-line border-b last:border-0">
                  <th className="bg-card-soft text-muted px-5 py-3.5 text-[12px] font-semibold tracking-wide uppercase">
                    {row.label}
                  </th>
                  {q.data.map((r) => (
                    <td key={r.program._id} className="border-line text-body border-l px-5 py-3.5 align-top">
                      {row.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
