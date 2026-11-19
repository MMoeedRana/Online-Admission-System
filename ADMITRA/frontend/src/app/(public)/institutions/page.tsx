import { Building2, GraduationCap, MapPin, Search } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { ServiceUnavailable } from '@/features/public/service-unavailable';
import { INSTITUTION_TYPES, PROVINCES, SECTORS } from '@/lib/constants';
import { serverGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Institutions' };

interface Row {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  type: keyof typeof INSTITUTION_TYPES;
  sector: keyof typeof SECTORS;
  city: string;
  province: string;
  programs: number;
  openCampaigns: number;
}

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  let result;
  try {
    result = await serverGet<Row[]>('/public/institutions', {
      q: sp.q,
      province: sp.province,
      type: sp.type,
      sector: sp.sector,
      page: sp.page,
      limit: '24',
    });
  } catch {
    return <ServiceUnavailable />;
  }
  return (
    <div className="page-container py-8">
      <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Colleges and universities</h1>
      <p className="text-muted mt-1 text-[14px]">Institutions that run their admissions on ADMITRA.</p>
      <Card className="mt-6 p-4 sm:p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Input name="q" defaultValue={sp.q} placeholder="Institution name" aria-label="Institution name" />
          <Select name="province" defaultValue={sp.province ?? ''} aria-label="Province">
            <option value="">All provinces</option>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <Select name="type" defaultValue={sp.type ?? ''} aria-label="Type">
            <option value="">All types</option>
            {Object.entries(INSTITUTION_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
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
          <button className={buttonClass('primary', 'md')}>
            <Search className="size-4" /> Search
          </button>
        </form>
      </Card>
      {result.data.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon={Building2} title="No institutions found" text="Try a different name or remove a filter." />
        </Card>
      ) : (
        <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {result.data.map((i) => (
            <StaggerItem key={i.id} hover className="h-full min-w-0">
              <Link
                href={`/institutions/${i.slug}`}
                className="group border-line bg-card hover:border-primary/40 block h-full rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)] transition hover:shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <span className="bg-navy flex size-12 shrink-0 items-center justify-center rounded-xl text-[14px] font-extrabold text-white">
                    {i.shortName}
                  </span>
                  <div className="min-w-0">
                    <h2 className="group-hover:text-primary text-[15.5px] font-bold">{i.name}</h2>
                    <p className="text-muted mt-0.5 flex items-center gap-1 text-[12.5px]">
                      <MapPin className="size-3.5" /> {i.city}, {i.province}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="blue" dot={false}>
                    {INSTITUTION_TYPES[i.type]}
                  </Badge>
                  <Badge tone="gray" dot={false}>
                    {SECTORS[i.sector]}
                  </Badge>
                  {i.openCampaigns > 0 && <Badge tone="green">Admissions open</Badge>}
                </div>
                <p className="border-line text-body mt-4 flex items-center gap-1.5 border-t pt-3 text-[13px]">
                  <GraduationCap className="text-muted size-4" /> {i.programs} programs
                </p>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
