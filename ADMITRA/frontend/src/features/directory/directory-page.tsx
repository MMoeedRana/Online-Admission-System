'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarClock, GitCompare, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { useCompare } from '@/features/advisor/advisor-page';
import type { DirProgramRow } from '@/features/advisor/types';
import { getPaged, get } from '@/lib/api';
import { DEGREE_LEVELS, PROVINCES } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export const DATA_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'gray' }> = {
  VERIFIED: { label: 'Verified data', tone: 'green' },
  DRAFT: { label: 'Draft data', tone: 'amber' },
  NONE: { label: 'No data yet', tone: 'gray' },
};

/** DIR-6 (Figure 4.4): institutions and programs with filters and comparison. */
export function DirectoryPage() {
  const [f, setF] = useState({
    q: '',
    province: '',
    city: '',
    sector: '',
    degreeLevel: '',
    fieldGroup: '',
    maxFee: '',
    openOnly: false,
  });
  const [page, setPage] = useState(1);
  const compare = useCompare();
  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(1);
  };
  const filters = useQuery({
    queryKey: ['directory', 'filters'],
    queryFn: () => get<{ cities: string[]; fieldGroups: string[] }>('/public/directory/filters'),
  });
  const list = useQuery({
    queryKey: ['directory', 'programs', f, page],
    queryFn: () =>
      getPaged<DirProgramRow>('/public/directory/programs', {
        ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== false)),
        page,
        limit: 24,
      }),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader
        title="Directory of colleges and universities"
        subtitle="Programs, fees and the closing merit of past years, with their sources"
        actions={
          compare.ids.length ? (
            <ButtonLink href={`/compare?ids=${compare.ids.join(',')}`} icon={<GitCompare className="size-4" />}>
              Compare ({compare.ids.length})
            </ButtonLink>
          ) : (
            <ButtonLink href="/advisor" variant="secondary">
              Check my chances
            </ButtonLink>
          )
        }
      />
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr]">
          <label className="relative sm:col-span-2 lg:col-span-4 2xl:col-span-1">
            <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              className="pl-10"
              placeholder="Program or institution"
              value={f.q}
              onChange={(e) => set('q', e.target.value)}
              aria-label="Search"
            />
          </label>
          <Select value={f.province} onChange={(e) => set('province', e.target.value)} aria-label="Province">
            <option value="">All provinces</option>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Select value={f.city} onChange={(e) => set('city', e.target.value)} aria-label="City">
            <option value="">All cities</option>
            {filters.data?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select value={f.sector} onChange={(e) => set('sector', e.target.value)} aria-label="Sector">
            <option value="">Public and private</option>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </Select>
          <Select value={f.degreeLevel} onChange={(e) => set('degreeLevel', e.target.value)} aria-label="Degree">
            <option value="">All degrees</option>
            {Object.entries(DEGREE_LEVELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={f.fieldGroup} onChange={(e) => set('fieldGroup', e.target.value)} aria-label="Field">
            <option value="">All fields</option>
            {filters.data?.fieldGroups.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input
            inputMode="numeric"
            placeholder="Max fee / semester"
            value={f.maxFee}
            onChange={(e) => set('maxFee', e.target.value)}
            aria-label="Maximum fee"
          />
        </div>
        <Checkbox
          className="mt-3 w-fit border-0 p-0"
          label="Admissions open on ADMITRA now"
          checked={f.openOnly}
          onChange={(e) => set('openOnly', e.target.checked)}
        />
      </Card>

      <p className="text-muted mt-5 mb-3 text-[13.5px]">
        {list.data ? `${list.data.meta.total} programs` : 'Loading programs…'}
      </p>
      {list.data && list.data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No programs match these filters"
            text="Try another city, degree or a higher fee limit."
          />
        </Card>
      ) : (
        <Stagger
          key={JSON.stringify(f) + page}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          gap={0.03}
        >
          {(list.data?.data ?? []).map((p) => (
            <StaggerItem key={p._id} hover className="h-full min-w-0">
              <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={DATA_STATUS[p.dataStatus]!.tone}>{DATA_STATUS[p.dataStatus]!.label}</Badge>
                  {p.institution.onAdmitra && <Badge tone="blue">On ADMITRA</Badge>}
                </div>
                <Link
                  href={`/directory/programs/${p._id}`}
                  className="text-ink hover:text-primary mt-3 py-0.5 text-[15.5px] leading-snug font-bold"
                >
                  {p.title}
                </Link>
                <Link
                  href={`/directory/institutions/${p.institution.slug}`}
                  className="text-muted hover:text-primary flex min-h-6 items-center text-[13px]"
                >
                  <span className="truncate">
                    {p.institution.name} · {p.institution.city}
                  </span>
                </Link>
                <dl className="border-line mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-[12.5px]">
                  <div>
                    <dt className="text-muted">Last closing merit</dt>
                    <dd className="text-ink text-[16px] font-bold tabular-nums">
                      {p.lastClosing?.toFixed(2) ?? '-'}{' '}
                      {p.dataYear && <span className="text-muted text-[12px] font-medium">({p.dataYear})</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Fee / semester</dt>
                    <dd className="text-ink text-[16px] font-bold">{formatMoney(p.feePerSemester)}</dd>
                  </div>
                </dl>
                <p className="text-muted mt-3 text-[12px]">
                  {DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] ?? p.degreeLevel} · {p.durationYears}{' '}
                  years · {p.institution.sector === 'PUBLIC' ? 'Public' : 'Private'}
                </p>
                {p.openCampaign && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-green-700 dark:text-green-400">
                    <CalendarClock className="size-4" /> Open until {formatDate(p.openCampaign.closesAt)}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <ButtonLink href={`/directory/programs/${p._id}`} size="sm" variant="secondary">
                    Details
                  </ButtonLink>
                  <button
                    onClick={() => compare.toggle(p._id)}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition',
                      compare.ids.includes(p._id)
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line text-body hover:bg-card-soft',
                    )}
                  >
                    <GitCompare className="size-4" /> {compare.ids.includes(p._id) ? 'Comparing' : 'Compare'}
                  </button>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <Pagination meta={list.data?.meta} onPage={setPage} className="mt-6" />
      <p className="text-muted mt-6 text-center text-[12px]">
        Figures are indicative and come from the sources shown on each program. Only verified data is used by the
        Admission Advisor.
      </p>
    </>
  );
}
