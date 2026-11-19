'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarClock, ExternalLink, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Reveal, Stagger, StaggerItem } from '@/components/ui/motion';
import { FullPageLoader } from '@/components/ui/spinner';
import type { DirInstitution, DirProgram, ProgramSummary } from '@/features/advisor/types';
import { errorMessage, get } from '@/lib/api';
import { DEGREE_LEVELS, INSTITUTION_TYPES } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import { DATA_STATUS } from './directory-page';

/** DIR-1 / DIR-7: an institution of the directory with its programs. */
export function DirectoryInstitutionDetail({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ['directory', 'institution', slug],
    queryFn: () =>
      get<{ institution: DirInstitution; programs: (DirProgram & ProgramSummary)[] }>(
        `/public/directory/institutions/${slug}`,
      ),
  });
  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <FullPageLoader />;
  const { institution: i, programs } = q.data;
  return (
    <div className="space-y-6">
      <Reveal>
        <section className="hero-gradient overflow-hidden rounded-[24px] px-6 py-8 text-white sm:px-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-[18px] font-extrabold ring-1 ring-white/15">
                {i.shortName || <Building2 className="size-6" />}
              </span>
              <div>
                <h1 className="text-[26px] leading-tight font-extrabold text-white">{i.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-blue-100/90">
                  <MapPin className="size-4" /> {i.city}, {i.province} ·{' '}
                  {INSTITUTION_TYPES[i.type as keyof typeof INSTITUTION_TYPES]} ·{' '}
                  {i.sector === 'PUBLIC' ? 'Public' : 'Private'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {i.onAdmitra && <Badge tone="blue">Admissions on ADMITRA</Badge>}
              {i.website && (
                <a
                  href={i.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-[13.5px] font-semibold ring-1 ring-white/20 hover:bg-white/15"
                >
                  Website <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          </div>
          {i.about && <p className="mt-5 max-w-3xl text-[14.5px] text-blue-100/90">{i.about}</p>}
          {i.campuses.length > 0 && (
            <p className="mt-3 text-[13px] text-blue-100/80">
              Campuses: {i.campuses.map((c) => `${c.name} (${c.city})`).join(' · ')}
            </p>
          )}
        </section>
      </Reveal>
      <h2 className="text-[17px] font-bold">{programs.length} programs</h2>
      <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" gap={0.04}>
        {programs.map((p) => (
          <StaggerItem key={p._id} hover className="h-full min-w-0">
            <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-lg">
              <Badge tone={DATA_STATUS[p.dataStatus]!.tone} className="w-fit">
                {DATA_STATUS[p.dataStatus]!.label}
              </Badge>
              <Link
                href={`/directory/programs/${p._id}`}
                className="text-ink hover:text-primary mt-3 text-[15.5px] font-bold"
              >
                {p.title}
              </Link>
              <p className="text-muted text-[12.5px]">
                {DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] ?? p.degreeLevel} ·{' '}
                {formatMoney(p.feePerSemester)} / semester
              </p>
              <p className="text-ink mt-3 text-[13.5px]">
                Last closing merit <b className="text-[16px]">{p.lastClosing?.toFixed(2) ?? '-'}</b>
                {p.dataYear && <span className="text-muted"> ({p.dataYear})</span>}
              </p>
              {p.openCampaign && (
                <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-green-700 dark:text-green-400">
                  <CalendarClock className="size-4" /> Open until {formatDate(p.openCampaign.closesAt)}
                </p>
              )}
              <div className="mt-auto pt-4">
                <ButtonLink href={`/directory/programs/${p._id}`} size="sm" variant="secondary">
                  Merit history
                </ButtonLink>
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
