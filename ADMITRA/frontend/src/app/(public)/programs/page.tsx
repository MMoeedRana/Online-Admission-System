import { GraduationCap, SlidersHorizontal } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { ProgramCard } from '@/features/public/program-card';
import { ServiceUnavailable } from '@/features/public/service-unavailable';
import { DEGREE_LEVELS, PROVINCES, SECTORS } from '@/lib/constants';
import { serverGet } from '@/lib/server-api';
import type { PublicProgram } from '@/lib/types';

export const metadata: Metadata = { title: 'Programs' };

type Search = Record<string, string | undefined>;

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const params = {
    q: sp.q,
    province: sp.province,
    city: sp.city,
    degreeLevel: sp.degreeLevel,
    sector: sp.sector,
    maxFee: sp.maxFee,
    openOnly: sp.openOnly,
    page: sp.page,
    limit: '12',
  };
  let result: Awaited<ReturnType<typeof serverGet<PublicProgram[]>>> | null = null;
  let cities: string[] = [];
  try {
    const [r, f] = await Promise.all([
      serverGet<PublicProgram[]>('/public/programs', params),
      serverGet<{ cities: string[] }>('/public/filters'),
    ]);
    result = r;
    cities = f.data.cities;
  } catch {
    return <ServiceUnavailable />;
  }
  const meta = result.meta!;
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...params, limit: undefined, page: String(p) }).filter(([, v]) => v) as [string, string][],
    );
    return `/programs?${qs}`;
  };

  return (
    <div className="page-container py-8">
      <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Find a program</h1>
      <p className="text-muted mt-1 text-[14px]">
        Search programs of colleges and universities on ADMITRA and see which ones are open for admission.
      </p>

      <Card className="mt-6 p-4 sm:p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
          <Input name="q" defaultValue={sp.q} placeholder="Program, field or institution" aria-label="Search" />
          <Select name="degreeLevel" defaultValue={sp.degreeLevel ?? ''} aria-label="Degree level">
            <option value="">All degrees</option>
            {Object.entries(DEGREE_LEVELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select name="province" defaultValue={sp.province ?? ''} aria-label="Province">
            <option value="">All provinces</option>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Select name="city" defaultValue={sp.city ?? ''} aria-label="City">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select name="sector" defaultValue={sp.sector ?? ''} aria-label="Sector">
            <option value="">Public and private</option>
            {Object.entries(SECTORS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass('primary', 'md')}>
            <SlidersHorizontal className="size-4" /> Search
          </button>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-6">
            <label className="text-ink flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                name="openOnly"
                value="true"
                defaultChecked={sp.openOnly === 'true'}
                className="size-4 accent-[var(--primary)]"
              />
              Only programs open for admission
            </label>
            <label className="text-ink flex items-center gap-2 text-[13px] font-medium">
              Maximum admission fee (Rs.)
              <Input
                placeholder="Max fee"
                name="maxFee"
                type="number"
                min={0}
                step={1000}
                defaultValue={sp.maxFee}
                className="h-9 w-32"
              />
            </label>
            {Object.values(sp).some(Boolean) && (
              <Link href="/programs" className="text-primary text-[13px] font-semibold">
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </Card>

      <p className="text-muted mt-6 text-[13px]">
        {meta.total} program{meta.total === 1 ? '' : 's'} found
      </p>
      {result.data.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon={GraduationCap}
            title="No programs match your search"
            text="Try removing some filters or searching with a different word."
          />
        </Card>
      ) : (
        <Stagger className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {result.data.map((p) => (
            <StaggerItem key={p.id} hover className="h-full min-w-0">
              <ProgramCard program={p} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
      {meta.pages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-2">
          {meta.page > 1 && (
            <Link href={pageHref(meta.page - 1)} className={buttonClass('secondary', 'sm')}>
              Previous
            </Link>
          )}
          <span className="text-ink px-3 text-[13px] font-semibold">
            Page {meta.page} of {meta.pages}
          </span>
          {meta.page < meta.pages && (
            <Link href={pageHref(meta.page + 1)} className={buttonClass('secondary', 'sm')}>
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
