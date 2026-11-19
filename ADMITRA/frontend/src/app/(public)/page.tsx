import { ArrowRight, Compass, ListChecks, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { CountUp, Reveal, Stagger, StaggerItem } from '@/components/ui/motion';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { serverGet } from '@/lib/server-api';

interface OpenRow {
  programId: string;
  program: string;
  institution: string;
  institutionSlug: string;
  city: string;
  campaign: string;
  closesAt: string;
}

async function loadHome() {
  try {
    const [stats, open] = await Promise.all([
      serverGet<{ institutions: number; programs: number; openCampaigns: number; cities: number }>('/public/stats'),
      serverGet<OpenRow[]>('/public/open-admissions', { limit: '8' }),
    ]);
    return { stats: stats.data, open: open.data, total: open.meta?.total ?? open.data.length };
  } catch {
    return null;
  }
}

const features = [
  {
    icon: Compass,
    tint: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
    title: 'Admission Advisor',
    text: 'Enter your marks and see Safe, Target and Reach programs with your chance in each.',
  },
  {
    icon: ShieldCheck,
    tint: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-300',
    title: 'Verified marks',
    text: 'Your marks are matched with board results so merit lists are built only from real marks.',
  },
  {
    icon: ListChecks,
    tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    title: 'Where is my name?',
    text: 'One page shows your result in every institution. No more visiting campuses.',
  },
];

export default async function HomePage() {
  const home = await loadHome();
  const stats = home?.stats;
  const figures = [
    { value: stats?.institutions, label: 'Institutions' },
    { value: stats?.programs, label: 'Programs' },
    { value: stats?.openCampaigns, label: 'Open campaigns' },
    { value: stats?.cities, label: 'Cities' },
  ];
  return (
    <div className="page-container pt-6 sm:pt-10">
      <Reveal y={20}>
        <section className="hero-gradient relative overflow-hidden rounded-[28px] px-6 py-10 text-white sm:px-12 sm:py-14 2xl:px-16 2xl:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold text-blue-100 ring-1 ring-white/15">
                <span className="size-1.5 rounded-full bg-blue-300" />
                {stats && stats.openCampaigns > 0
                  ? `Admissions ${new Date().getFullYear()} are open`
                  : 'Admissions made simple'}
              </span>
              <h1 className="mt-5 text-[32px] leading-[1.1] font-extrabold tracking-tight text-white sm:text-[46px]">
                One profile. Every college and university.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-blue-100/90 sm:text-[17px]">
                Find where your marks can get you in, apply online with verified marks, and see your name in the merit
                list without visiting any campus.
              </p>
              <form action="/programs" className="mt-7 flex flex-col gap-3 sm:flex-row">
                <label className="relative flex-1 sm:max-w-md">
                  <span className="sr-only">Search a program or institution</span>
                  <input
                    name="q"
                    placeholder="Search a program or institution..."
                    className="h-[52px] w-full rounded-xl bg-white pr-12 pl-4 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-blue-400/40"
                  />
                  <Search className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-slate-400" />
                </label>
                <button
                  type="submit"
                  className="bg-primary shadow-button hover:bg-primary-hover inline-flex h-[52px] items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white"
                >
                  Find programs <ArrowRight className="size-4" />
                </button>
              </form>
            </div>
            <Stagger className="grid grid-cols-2 gap-3 sm:gap-4" gap={0.08}>
              {figures.map((f) => (
                <StaggerItem
                  key={f.label}
                  hover
                  className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-white/[0.12] sm:p-5"
                >
                  <p className="text-[26px] font-extrabold text-white tabular-nums sm:text-[32px]">
                    {f.value === undefined ? '-' : <CountUp value={f.value} />}
                  </p>
                  <p className="mt-1 text-[13px] text-blue-100/80">{f.label}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      </Reveal>

      <Stagger className="mt-6 grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <StaggerItem key={f.title} hover>
            <Card className="group h-full p-6 transition-shadow hover:shadow-lg sm:p-7">
              <span
                className={`flex size-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${f.tint}`}
              >
                <f.icon className="size-6" />
              </span>
              <h2 className="mt-5 text-[17px] font-bold">{f.title}</h2>
              <p className="text-muted mt-2 text-[14px] leading-relaxed">{f.text}</p>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 sm:px-6">
          <h2 className="text-[16px] font-bold">Open admission campaigns</h2>
          <Link href="/programs?openOnly=true" className="text-body hover:text-primary text-[13.5px] font-semibold">
            View all
          </Link>
        </div>
        {!home ? (
          <p className="text-muted px-6 pb-8 text-[13.5px]">
            Open admissions cannot be loaded right now. Please refresh in a moment.
          </p>
        ) : home.open.length === 0 ? (
          <p className="text-muted px-6 pb-8 text-[13.5px]">There are no open admission campaigns at the moment.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                    <th className="px-6 py-3 font-semibold">Institution</th>
                    <th className="px-4 py-3 font-semibold">Program</th>
                    <th className="px-4 py-3 font-semibold">Campaign</th>
                    <th className="px-4 py-3 font-semibold">Closes</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {home.open.map((r) => (
                    <tr key={r.programId + r.campaign} className="border-line border-b last:border-0">
                      <td className="text-ink px-6 py-4 font-semibold">
                        <Link href={`/institutions/${r.institutionSlug}`} className="hover:text-primary">
                          {r.institution}
                        </Link>
                      </td>
                      <td className="px-4 py-4">{r.program}</td>
                      <td className="px-4 py-4">{r.campaign}</td>
                      <td className="text-muted px-4 py-4">{formatDate(r.closesAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <ButtonLink href={`/programs/${r.programId}`} size="sm">
                          Apply now
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-line border-line divide-y border-t md:hidden">
              {home.open.map((r) => (
                <li key={r.programId + r.campaign} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-ink truncate font-semibold">{r.program}</p>
                    <p className="text-muted truncate text-[12.5px]">
                      {r.institution} · closes {formatDate(r.closesAt)}
                    </p>
                  </div>
                  <ButtonLink href={`/programs/${r.programId}`} size="sm">
                    Apply
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
