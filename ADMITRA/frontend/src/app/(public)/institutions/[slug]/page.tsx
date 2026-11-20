import { ArrowLeft, Building, CalendarClock, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ProgramCard } from '@/features/public/program-card';
import { ServiceUnavailable } from '@/features/public/service-unavailable';
import { INSTITUTION_TYPES, SECTORS } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { ServerApiError, serverGet } from '@/lib/server-api';
import type { PublicProgram } from '@/lib/types';

interface Profile {
  name: string;
  shortName: string;
  type: keyof typeof INSTITUTION_TYPES;
  sector: keyof typeof SECTORS;
  city: string;
  province: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  about: string;
  campuses: { _id: string; name: string; city: string; address: string; isMain: boolean }[];
  departments: { _id: string; name: string }[];
  programs: PublicProgram[];
  openCampaigns: { id: string; title: string; closesAt: string; programs: number }[];
}

async function load(slug: string) {
  try {
    return (await serverGet<Profile>(`/public/institutions/${slug}`)).data;
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const i = await load((await params).slug);
  return { title: i?.name ?? 'Institution' };
}

export default async function InstitutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const i = await load((await params).slug);
  if (!i) return <ServiceUnavailable />;
  return (
    <div className="page-container py-8">
      <Link
        href="/institutions"
        className="text-muted hover:text-primary inline-flex items-center gap-1.5 text-[13px] font-semibold"
      >
        <ArrowLeft className="size-4" /> All institutions
      </Link>
      <section className="hero-gradient mt-4 rounded-[24px] p-6 text-white sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[18px] font-extrabold ring-1 ring-white/20">
            {i.shortName}
          </span>
          <div>
            <h1 className="text-[24px] font-bold text-white sm:text-[30px]">{i.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-blue-100/90">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {i.city}, {i.province}
              </span>
              <span>
                {INSTITUTION_TYPES[i.type]} · {SECTORS[i.sector]}
              </span>
            </p>
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {i.openCampaigns.length > 0 && (
            <Card className="border-green-200 bg-green-50/60 dark:border-green-500/25 dark:bg-green-500/5">
              <CardBody>
                {i.openCampaigns.map((c) => (
                  <p key={c.id} className="flex flex-wrap items-center gap-2 text-[14px]">
                    <CalendarClock className="size-[18px] text-green-700 dark:text-green-400" />
                    <span className="text-ink font-semibold">{c.title} admissions are open</span>
                    <span className="text-muted">
                      until {formatDate(c.closesAt)} · {c.programs} programs
                    </span>
                  </p>
                ))}
              </CardBody>
            </Card>
          )}
          {i.about && (
            <Card>
              <CardHeader title="About" />
              <CardBody>
                <p className="text-[14.5px] leading-relaxed">{i.about}</p>
              </CardBody>
            </Card>
          )}
          <div>
            <h2 className="text-[18px] font-bold">Programs ({i.programs.length})</h2>
            <Stagger className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {i.programs.map((p) => (
                <StaggerItem key={p.id} hover className="h-full min-w-0">
                  <ProgramCard program={p} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
        <aside className="space-y-6">
          <Card className="p-6">
            <h2 className="text-[15px] font-bold">Contact</h2>
            <ul className="mt-4 space-y-3 text-[13.5px]">
              {i.website && (
                <li className="flex items-center gap-2.5">
                  <Globe className="text-muted size-4" />
                  <a
                    href={i.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary truncate hover:underline"
                  >
                    {i.website.replace(/^https?:\/\//, '')}
                  </a>
                </li>
              )}
              {i.email && (
                <li className="flex items-center gap-2.5">
                  <Mail className="text-muted size-4" /> {i.email}
                </li>
              )}
              {i.phone && (
                <li className="flex items-center gap-2.5">
                  <Phone className="text-muted size-4" /> {i.phone}
                </li>
              )}
            </ul>
          </Card>
          <Card className="p-6">
            <h2 className="text-[15px] font-bold">Campuses</h2>
            <ul className="mt-4 space-y-3">
              {i.campuses.map((c) => (
                <li key={c._id} className="flex gap-2.5 text-[13.5px]">
                  <Building className="text-muted mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="text-ink font-semibold">
                      {c.name}{' '}
                      {c.isMain && (
                        <Badge tone="blue" dot={false} className="ml-1 py-0.5">
                          Main
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted">{c.address || c.city}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {i.departments.length > 0 && (
            <Card className="p-6">
              <h2 className="text-[15px] font-bold">Departments</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {i.departments.map((d) => (
                  <Badge key={d._id} tone="gray" dot={false}>
                    {d.name}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
