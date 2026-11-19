import { Building2, CalendarClock, MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DEGREE_LEVELS } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import type { PublicProgram } from '@/lib/types';

export function OpenBadge({ program }: { program: PublicProgram }) {
  return program.openCampaign ? (
    <Badge tone="green">Open until {formatDate(program.openCampaign.closesAt)}</Badge>
  ) : (
    <Badge tone="gray">Admissions closed</Badge>
  );
}

export function ProgramCard({ program }: { program: PublicProgram }) {
  return (
    <Link
      href={`/programs/${program.id}`}
      className="group border-line bg-card hover:border-primary/40 flex flex-col rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="bg-primary-soft text-primary rounded-lg px-2 py-1 text-[11.5px] font-bold">
          {DEGREE_LEVELS[program.degreeLevel as keyof typeof DEGREE_LEVELS] ?? program.degreeLevel}
        </span>
        <OpenBadge program={program} />
      </div>
      <h3 className="group-hover:text-primary mt-3 text-[16px] font-bold">{program.title}</h3>
      {program.institution && (
        <p className="text-body mt-1 flex items-center gap-1.5 text-[13px]">
          <Building2 className="text-muted size-4" /> {program.institution.name}
        </p>
      )}
      <div className="border-line mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-[12.5px]">
        <span className="text-muted flex items-center gap-1.5">
          <MapPin className="size-4" /> {program.institution?.city}
        </span>
        <span className="text-muted flex items-center gap-1.5">
          <Users className="size-4" /> {program.seats} seats
        </span>
        <span className="text-muted flex items-center gap-1.5">
          <CalendarClock className="size-4" /> {program.durationYears} years
        </span>
        <span className="text-ink font-semibold">{formatMoney(program.admissionFee)}</span>
      </div>
    </Link>
  );
}
