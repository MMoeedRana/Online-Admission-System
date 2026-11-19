import { ArrowLeft, Building2, CalendarClock, CheckCircle2, Clock, GraduationCap, MapPin, Users } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { OpenBadge, ProgramCard } from '@/features/public/program-card';
import { ServiceUnavailable } from '@/features/public/service-unavailable';
import { DEGREE_LEVELS, QUALIFICATION_LEVELS, SHIFTS } from '@/lib/constants';
import { daysLeft, formatDate, formatMoney } from '@/lib/format';
import { ServerApiError, serverGet } from '@/lib/server-api';
import type { Eligibility, PublicProgram } from '@/lib/types';

type Detail = PublicProgram & {
  description: string;
  eligibility: Eligibility[];
  testName: string;
  department: string;
  campus: { name: string; city: string; address: string } | null;
  related: PublicProgram[];
};

async function load(id: string) {
  try {
    return (await serverGet<Detail>(`/public/programs/${id}`)).data;
  } catch (e) {
    if (e instanceof ServerApiError && (e.status === 404 || e.status === 422)) notFound();
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load((await params).id);
  return { title: p ? `${p.title} - ${p.institution?.name}` : 'Program' };
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await load(id);
  if (!p) return <ServiceUnavailable />;
  const open = p.openCampaign;
  return (
    <div className="page-container py-8">
      <Link
        href="/programs"
        className="text-muted hover:text-primary inline-flex items-center gap-1.5 text-[13px] font-semibold"
      >
        <ArrowLeft className="size-4" /> All programs
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-primary-soft text-primary rounded-lg px-2 py-1 text-[12px] font-bold">
                {DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] ?? p.degreeLevel}
              </span>
              <OpenBadge program={p} />
            </div>
            <h1 className="mt-3 text-[26px] font-bold tracking-tight sm:text-[30px]">{p.title}</h1>
            {p.institution && (
              <Link
                href={`/institutions/${p.institution.slug}`}
                className="text-body hover:text-primary mt-2 inline-flex items-center gap-2 text-[15px] font-semibold"
              >
                <Building2 className="text-muted size-[18px]" /> {p.institution.name}
              </Link>
            )}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { icon: Clock, label: 'Duration', value: `${p.durationYears} years` },
                { icon: Users, label: 'Total seats', value: String(p.seats) },
                { icon: MapPin, label: 'Campus', value: p.campus?.city ?? p.institution?.city ?? '-' },
                { icon: GraduationCap, label: 'Department', value: p.department || '-' },
              ].map((f) => (
                <div key={f.label} className="bg-card-soft rounded-xl p-3.5">
                  <f.icon className="text-primary size-[18px]" />
                  <p className="text-muted mt-2 text-[11.5px] font-semibold tracking-wide uppercase">{f.label}</p>
                  <p className="text-ink mt-0.5 text-[14px] font-semibold">{f.value}</p>
                </div>
              ))}
            </div>
            {p.description && <p className="mt-6 text-[14.5px] leading-relaxed">{p.description}</p>}
          </Card>

          <Card>
            <CardHeader title="Eligibility" subtitle="Minimum requirements to apply for this program" />
            <CardBody className="space-y-3">
              {p.eligibility.length === 0 && (
                <p className="text-muted text-[13.5px]">No special requirements are listed.</p>
              )}
              {p.eligibility.map((e, i) => (
                <div key={i} className="border-line flex gap-3 rounded-xl border p-3.5">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
                  <div>
                    <p className="text-ink text-[14px] font-semibold">
                      {QUALIFICATION_LEVELS[e.level as keyof typeof QUALIFICATION_LEVELS] ?? e.level}: at least{' '}
                      {e.minPercentage}%
                    </p>
                    {e.groups.length > 0 && (
                      <p className="text-muted mt-0.5 text-[13px]">Groups: {e.groups.join(', ')}</p>
                    )}
                    {e.subjects.length > 0 && (
                      <p className="text-muted mt-0.5 text-[13px]">Subjects: {e.subjects.join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
              {p.testRequired && (
                <Alert tone="info" title="Entry test required">
                  Applicants must appear in the {p.testName || 'entry test'}. The test result is part of the merit.
                </Alert>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Seats by shift" />
            <CardBody className="grid gap-3 sm:grid-cols-3">
              {p.shifts.map((s) => (
                <div key={s.name} className="border-line rounded-xl border p-4">
                  <p className="text-muted text-[12px] font-semibold tracking-wide uppercase">
                    {SHIFTS[s.name as keyof typeof SHIFTS] ?? s.name}
                  </p>
                  <p className="text-ink mt-1 text-[22px] font-bold">{s.seats}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <h2 className="text-[15px] font-bold">Fees</h2>
            <dl className="mt-4 space-y-3 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-muted">Application fee</dt>
                <dd className="text-ink font-semibold">{formatMoney(p.applicationFee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Admission fee</dt>
                <dd className="text-ink font-semibold">{formatMoney(p.admissionFee)}</dd>
              </div>
            </dl>
            <div className="border-line mt-6 border-t pt-5">
              {open ? (
                <>
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold text-green-700 dark:text-green-400">
                    <CalendarClock className="size-4" /> {open.title}: open until {formatDate(open.closesAt)}
                  </p>
                  <p className="text-muted mt-1 text-[12.5px]">
                    {Math.max(0, daysLeft(open.closesAt))} day(s) left to apply.
                  </p>
                  <ButtonLink
                    href={`/applicant/apply?campaign=${open.campaignId}&program=${id}`}
                    className="mt-4 w-full"
                  >
                    Apply now
                  </ButtonLink>
                  <p className="text-muted mt-2 text-center text-[12px]">You need a free applicant account to apply.</p>
                </>
              ) : (
                <p className="text-muted text-[13.5px]">Admissions for this program are not open at the moment.</p>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {p.related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[18px] font-bold">More programs at {p.institution?.shortName}</h2>
          <Stagger className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {p.related.map((r) => (
              <StaggerItem key={r.id} hover className="h-full min-w-0">
                <ProgramCard program={r} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}
    </div>
  );
}
