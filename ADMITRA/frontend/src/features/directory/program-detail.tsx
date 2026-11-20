'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Compass,
  ExternalLink,
  GitCompare,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Reveal } from '@/components/ui/motion';
import { FullPageLoader } from '@/components/ui/spinner';
import { useCompare, useShortlist } from '@/features/advisor/advisor-page';
import type { DirInstitution, DirProgram, HistoryRow } from '@/features/advisor/types';
import { errorMessage, get } from '@/lib/api';
import { DEGREE_LEVELS } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBrand } from '@/features/branding/brand-context';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COMPONENT: Record<string, string> = {
  MATRIC: 'Matric',
  INTERMEDIATE: 'Intermediate',
  ENTRY_TEST: 'Entry test',
  BACHELOR_16: "Bachelor's (16 years)",
};
const ORIGIN: Record<string, string> = {
  ADMITRA: 'Official',
  IMPORT: 'Published merit list',
  MANUAL: 'Entered from source',
};

interface Detail {
  program: DirProgram;
  institution: DirInstitution & { institutionId?: string | null };
  history: HistoryRow[];
  openCampaign: { campaignId: string; title: string; closesAt: string } | null;
}

export function DirectoryProgramDetail({ id }: { id: string }) {
  const brand = useBrand();
  const router = useRouter();
  const compare = useCompare();
  const shortlist = useShortlist();
  const q = useQuery({
    queryKey: ['directory', 'program', id],
    queryFn: () => get<Detail>(`/public/directory/programs/${id}`),
  });
  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <FullPageLoader />;
  const { program: p, institution: i, history, openCampaign } = q.data;
  const verified = history.filter((h) => h.status === 'VERIFIED');
  const years = [...new Set(verified.map((h) => h.year))].sort();
  const chart = years.map((y) => {
    const row: Record<string, number | string> = { year: String(y) };
    for (const h of verified.filter((x) => x.year === y))
      row[`List ${h.round}${h.shift === 'EVENING' ? ' (evening)' : ''}`] = h.closingMerit;
    return row;
  });
  const series = [
    ...new Set(verified.map((h) => `List ${h.round}${h.shift === 'EVENING' ? ' (evening)' : ''}`)),
  ].sort();
  const colors = ['#1F6FEB', '#16A34A', '#D97706', '#7C3AED', '#0EA5E9', '#DC2626'];
  const latestYear = years.at(-1);

  return (
    <div className="space-y-6">
      <Reveal>
        <Card className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={verified.length ? 'green' : 'amber'}>
                  {verified.length ? `Verified data ${latestYear}` : 'Data waiting for verification'}
                </Badge>
                {i.onAdmitra || i.institutionId ? <Badge tone="blue">On {brand.platformName}</Badge> : null}
              </div>
              <h1 className="mt-3 text-[24px] font-bold tracking-tight">{p.title}</h1>
              <Link
                href={`/directory/institutions/${i.slug}`}
                className="text-muted hover:text-primary text-[14px] font-semibold"
              >
                {i.name}, {i.city}
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => (shortlist.isApplicant ? shortlist.toggle.mutate(p._id) : router.push('/login'))}
                className="border-line hover:bg-card-soft inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold"
              >
                {shortlist.saved.has(p._id) ? (
                  <BookmarkCheck className="text-primary size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {shortlist.saved.has(p._id) ? 'Saved' : 'Save'}
              </button>
              <button
                onClick={() => compare.toggle(p._id)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold',
                  compare.ids.includes(p._id)
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line hover:bg-card-soft',
                )}
              >
                <GitCompare className="size-4" /> Compare
              </button>
              <ButtonLink href="/advisor" variant="secondary" icon={<Compass className="size-4" />}>
                My chance
              </ButtonLink>
              {openCampaign ? (
                <ButtonLink
                  href={`/applicant/apply?campaign=${openCampaign.campaignId}&program=${p.programId}`}
                  icon={<ArrowRight className="size-4" />}
                >
                  Apply now
                </ButtonLink>
              ) : null}
            </div>
          </div>
          <dl className="border-line mt-6 grid grid-cols-2 gap-4 border-t pt-5 text-[13px] sm:grid-cols-3 xl:grid-cols-6">
            {[
              [
                'Degree',
                `${DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] ?? p.degreeLevel}, ${p.durationYears} years`,
              ],
              ['Fee per semester', formatMoney(p.feePerSemester)],
              ['Seats', p.seats || '-'],
              ['Shifts', p.shifts.map((s) => s.toLowerCase()).join(', ')],
              ['Usual admission months', p.admissionMonths.map((m) => MONTHS[m - 1]).join(', ') || '-'],
              ['Entry test', p.testName || '-'],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {openCampaign && (
            <p className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-green-700 dark:text-green-400">
              <CalendarClock className="size-4" /> {openCampaign.title} is open until{' '}
              {formatDate(openCampaign.closesAt)}
            </p>
          )}
        </Card>
      </Reveal>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Closing merit by year"
            subtitle="Last aggregate selected in each merit list (verified data)"
          />
          <div className="h-72 px-2 pt-4 pb-3">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -12, right: 12 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  />
                  <YAxis
                    domain={['dataMin - 5', 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--card-soft)' }}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {series.map((s, k) => (
                    <Bar key={s} dataKey={s} fill={colors[k % colors.length]} radius={[6, 6, 0, 0]} maxBarSize={34} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted pt-24 text-center text-[13px]">No verified merit history yet.</p>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Eligibility" />
            <CardBody className="space-y-1.5 text-[13.5px]">
              {p.eligibility.map((e) => (
                <p key={e.level}>
                  <b className="text-ink">{COMPONENT[e.level] ?? e.level}</b>: at least {e.minPercentage}%
                  {e.groups.length ? ` in ${e.groups.join(', ')}` : ''}
                </p>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Merit formula"
              subtitle={
                p.formula.length
                  ? 'Weights published by the institution'
                  : 'Not published: the Admission Advisor uses the standard formula'
              }
            />
            <CardBody className="space-y-2">
              {p.formula.map((f) => (
                <div key={f.component}>
                  <div className="flex justify-between text-[13px]">
                    <span>{COMPONENT[f.component] ?? f.component}</span>
                    <b className="text-ink">{f.weight}%</b>
                  </div>
                  <div className="bg-card-soft mt-1 h-2 overflow-hidden rounded-full">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${f.weight}%` }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Merit history and sources"
          subtitle="DRAFT rows are waiting for the super admin's check and are not used by the Admission Advisor"
        />
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead>
              <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                <th className="px-5 py-3 font-semibold">Year</th>
                <th className="px-3 py-3 font-semibold">List</th>
                <th className="px-3 py-3 font-semibold">Shift</th>
                <th className="px-3 py-3 font-semibold">Opening</th>
                <th className="px-3 py-3 font-semibold">Closing</th>
                <th className="px-3 py-3 font-semibold">Seats</th>
                <th className="px-3 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, k) => (
                <tr key={k} className="border-line border-b last:border-0">
                  <td className="text-ink px-5 py-3 font-semibold">{h.year}</td>
                  <td className="px-3 py-3">{h.round}</td>
                  <td className="px-3 py-3">{h.shift.toLowerCase()}</td>
                  <td className="px-3 py-3 tabular-nums">{h.openingMerit?.toFixed(2) ?? '-'}</td>
                  <td className="text-ink px-3 py-3 font-semibold tabular-nums">{h.closingMerit.toFixed(2)}</td>
                  <td className="px-3 py-3">{h.seats ?? '-'}</td>
                  <td className="max-w-xs px-3 py-3">
                    <span className="text-muted block truncate text-[12.5px]">{ORIGIN[h.origin]}</span>
                    {h.sourceUrl ? (
                      <a
                        href={h.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-[12.5px] font-semibold"
                      >
                        Source <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-[12.5px]">{h.source}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={h.status === 'VERIFIED' ? 'green' : 'amber'}>
                      {h.status === 'VERIFIED' ? 'Verified' : 'Draft'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-muted flex items-start gap-2 text-[12.5px]">
        <Info className="mt-0.5 size-4 shrink-0" /> Figures are indicative. Seats, formulas and merit change every year;
        always check the official source before deciding.
      </p>
    </div>
  );
}
