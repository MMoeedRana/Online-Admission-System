'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Reveal } from '@/components/ui/motion';
import { FullPageLoader } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useShortlist } from './advisor-page';
import { BANDS, BandBadge, ChanceRing, STANDING } from './band';
import type { AdvisorMeta, AdvisorResult, DirProgram, HistoryRow } from './types';

type Explained = AdvisorResult & { program: DirProgram; allHistory: HistoryRow[] };

const ORIGIN: Record<string, string> = {
  ADMITRA: 'Official (ADMITRA)',
  IMPORT: 'Published merit list',
  MANUAL: 'Entered from source',
};

/** PRED-8 (Figure 4.3): how a chance is calculated, with a what-if slider for the entry test. */
export function ExplainPage({ id, base = '' }: { id: string; base?: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const saved = sp.get('saved') === '1';
  const [test, setTest] = useState<number | null>(sp.get('test') ? Number(sp.get('test')) : null);
  const [error, setError] = useState('');
  const shortlist = useShortlist();
  const run = useMutation({
    mutationFn: async (t: number | null) =>
      (
        await api.post<{ data: Explained; meta: AdvisorMeta }>(`/public/advisor/programs/${id}`, {
          useSaved: saved,
          matric: saved ? undefined : Number(sp.get('matric')),
          inter: saved ? undefined : Number(sp.get('inter')),
          test: t,
          fieldGroup: sp.get('group') || undefined,
        })
      ).data,
    onError: (e) => setError(errorMessage(e)),
  });
  useEffect(() => {
    const h = setTimeout(() => run.mutate(test), test === null ? 0 : 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  if (error && !run.data) return <Alert tone="error">{error}</Alert>;
  const d = run.data?.data;
  if (!d) return <FullPageLoader />;
  const meta = run.data!.meta;
  const usesTest = d.breakdown.some((b) => b.component === 'ENTRY_TEST');
  const chart = [...d.allHistory]
    .filter((h) => h.shift === d.shift)
    .sort((a, b) => a.year - b.year || a.round - b.round)
    .map((h) => ({ label: `${h.year} R${h.round}`, closing: h.closingMerit, opening: h.openingMerit }));

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="text-muted hover:text-primary inline-flex items-center gap-1 text-[12.5px] font-semibold"
      >
        <ArrowLeft className="size-3.5" /> Back to results
      </button>
      <Reveal>
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <ChanceRing chance={d.prediction?.chance ?? null} band={d.band} size={96} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <BandBadge band={d.band} />
                <Badge tone={meta.basis === 'VERIFIED' ? 'green' : meta.basis === 'SELF_DECLARED' ? 'amber' : 'gray'}>
                  {meta.basis === 'VERIFIED'
                    ? 'Based on verified marks'
                    : meta.basis === 'SELF_DECLARED'
                      ? 'Based on self-declared marks'
                      : 'Based on entered marks'}
                </Badge>
                {d.standardFormula && <Badge tone="gray">Standard formula</Badge>}
              </div>
              <h1 className="mt-2 text-[22px] font-bold tracking-tight">{d.title}</h1>
              <p className="text-muted text-[13.5px]">
                <Link
                  href={`/directory/institutions/${d.institution.slug}`}
                  className="hover:text-primary font-semibold"
                >
                  {d.institution.name}
                </Link>{' '}
                · {d.institution.city} · {d.shift.toLowerCase()} shift · {formatMoney(d.feePerSemester)} per semester
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  shortlist.isApplicant ? shortlist.toggle.mutate(d.directoryProgramId) : router.push('/login')
                }
                className="border-line hover:bg-card-soft inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold"
              >
                {shortlist.saved.has(d.directoryProgramId) ? (
                  <BookmarkCheck className="text-primary size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {shortlist.saved.has(d.directoryProgramId) ? 'Saved' : 'Save'}
              </button>
              {d.openCampaign ? (
                <ButtonLink
                  href={`/applicant/apply?campaign=${d.openCampaign.campaignId}&program=${d.openCampaign.programId}`}
                  icon={<ArrowRight className="size-4" />}
                >
                  Apply by {formatDate(d.openCampaign.closesAt)}
                </ButtonLink>
              ) : d.applyUrl ? (
                <ButtonLink
                  href={d.applyUrl}
                  variant="secondary"
                  target="_blank"
                  icon={<ExternalLink className="size-4" />}
                >
                  Official website
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </Card>
      </Reveal>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="1. Your aggregate"
              subtitle={
                d.standardFormula
                  ? 'The weights of this program are not known, so the standard formula is used.'
                  : 'Using the weights of this program.'
              }
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                    <th className="px-5 py-2.5 font-semibold">Component</th>
                    <th className="px-3 py-2.5 font-semibold">Percentage</th>
                    <th className="px-3 py-2.5 font-semibold">Weight</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {d.breakdown.map((b) => (
                    <tr key={b.component} className="border-line border-b">
                      <td className="text-ink px-5 py-3 font-medium">
                        {b.label}
                        {b.component === 'ENTRY_TEST' && d.assumedTest && (
                          <span className="text-muted block text-[11.5px]">
                            No test marks given: Intermediate % used
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{b.percentage ?? '-'}%</td>
                      <td className="px-3 py-3 tabular-nums">{b.weight}%</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{b.contribution.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="text-ink px-5 py-3 font-bold" colSpan={3}>
                      Aggregate A = sum of (percentage x weight / 100)
                    </td>
                    <td className="text-primary px-5 py-3 text-right text-[17px] font-extrabold tabular-nums">
                      {d.aggregate.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {usesTest && (
              <CardBody className="border-line border-t pt-4">
                <label
                  htmlFor="whatif"
                  className="text-ink flex items-center justify-between text-[13.5px] font-semibold"
                >
                  What if my entry test is…
                  <span className="text-primary text-[18px] font-extrabold tabular-nums">
                    {test ?? meta.inputs.test ?? meta.inputs.inter}%
                  </span>
                </label>
                <input
                  id="whatif"
                  type="range"
                  min={30}
                  max={100}
                  step={1}
                  value={test ?? meta.inputs.test ?? Math.round(meta.inputs.inter)}
                  onChange={(e) => setTest(Number(e.target.value))}
                  className="mt-3 w-full accent-[var(--primary)]"
                />
                <p className="text-muted mt-1 text-[12px]">Recalculated instantly. Nothing is saved.</p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="2. Eligibility" />
            <CardBody className="space-y-2">
              {(d.program.eligibility ?? []).length === 0 && (
                <p className="text-muted text-[13px]">No published requirements.</p>
              )}
              {d.eligible ? (
                <p className="flex items-center gap-2 text-[13.5px] text-green-700 dark:text-green-400">
                  <CheckCircle2 className="size-4" /> You meet the published requirements.
                </p>
              ) : (
                d.reasons.map((r) => (
                  <p key={r} className="flex items-center gap-2 text-[13.5px] text-red-600">
                    <XCircle className="size-4" /> {r}
                  </p>
                ))
              )}
              <ul className="text-muted mt-2 space-y-1 text-[12.5px]">
                {d.program.eligibility.map((e) => (
                  <li key={e.level}>
                    {e.level === 'INTERMEDIATE' ? 'Intermediate' : e.level === 'MATRIC' ? 'Matric' : e.level}: at least{' '}
                    {e.minPercentage}%{e.groups.length ? ` (${e.groups.join(', ')})` : ''}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          {d.standing && (
            <Card className="flex items-center gap-4 p-5">
              <span className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-xl">
                <Users className="size-5" />
              </span>
              <div>
                <p className="text-ink text-[14.5px] font-bold">{STANDING[d.standing.band]}</p>
                <p className="text-muted text-[12.5px]">
                  Indicative standing among {d.standing.applicants} applicants of the open campaign. No names are shown.
                </p>
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="3. Closing merit of past years"
              subtitle={`${d.shift.toLowerCase()} shift, verified data only`}
            />
            <div className="h-64 px-2 pt-4">
              {chart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ left: -12, right: 16, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    />
                    <YAxis
                      domain={['dataMin - 3', 'dataMax + 3']}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12 }}
                    />
                    <ReferenceLine
                      y={d.aggregate}
                      stroke="#16A34A"
                      strokeDasharray="5 4"
                      label={{
                        value: `You ${d.aggregate.toFixed(1)}`,
                        fill: '#16A34A',
                        fontSize: 11,
                        position: 'insideTopRight',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="closing"
                      name="Closing merit"
                      stroke="#1F6FEB"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted pt-20 text-center text-[13px]">
                  No verified merit history for this program yet.
                </p>
              )}
            </div>
            {d.prediction && (
              <CardBody className="border-line grid grid-cols-3 gap-3 border-t pt-4 text-center">
                <div>
                  <p className="text-muted text-[11.5px]">Weighted mean (mu)</p>
                  <p className="text-ink text-[17px] font-bold tabular-nums">{d.prediction.mu}</p>
                </div>
                <div>
                  <p className="text-muted text-[11.5px]">Spread (sigma)</p>
                  <p className="text-ink text-[17px] font-bold tabular-nums">{d.prediction.sigma}</p>
                </div>
                <div>
                  <p className="text-muted text-[11.5px]">z = (A - mu) / sigma</p>
                  <p className="text-ink text-[17px] font-bold tabular-nums">{d.prediction.z}</p>
                </div>
                <p className="text-muted col-span-3 text-[12px]">
                  Chance = Phi(z) = <b className="text-ink">{d.prediction.chance}%</b> ({BANDS[d.band].label}). Years
                  used: {d.history.map((h) => h.year).join(', ')} with weights 0.5, 0.3 and 0.2.
                </p>
              </CardBody>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Sources" />
            <ul className="mt-3">
              {d.allHistory.slice(0, 8).map((h, i) => (
                <li
                  key={i}
                  className="border-line flex items-start justify-between gap-3 border-t px-5 py-3 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className="text-ink font-semibold">
                      {h.year}, list {h.round} ({h.shift.toLowerCase()}): {h.closingMerit.toFixed(2)}
                    </p>
                    <p className="text-muted truncate">{h.source}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={h.origin === 'ADMITRA' ? 'blue' : 'gray'}>{ORIGIN[h.origin]}</Badge>
                    {h.sourceUrl && (
                      <a
                        href={h.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary"
                        aria-label="Open source"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <p className={cn('text-muted flex items-start gap-2 text-[12.5px]')}>
        <Info className="mt-0.5 size-4 shrink-0" /> {meta.notice}
      </p>
      <p className="text-muted text-[12px]">
        <Link href={`${base}/advisor`} className="text-primary font-semibold">
          Back to the Admission Advisor
        </Link>
      </p>
    </div>
  );
}
