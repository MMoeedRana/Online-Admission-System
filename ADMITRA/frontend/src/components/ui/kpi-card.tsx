'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CountUp, Stagger, StaggerItem } from './motion';

const tints = {
  blue: { chip: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300', glow: 'from-blue-500/15' },
  green: { chip: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-300', glow: 'from-green-500/15' },
  amber: { chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', glow: 'from-amber-500/15' },
  purple: {
    chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    glow: 'from-violet-500/15',
  },
};

function Figure({ value }: { value: ReactNode }) {
  if (typeof value === 'number') return <CountUp value={value} />;
  if (typeof value === 'string') {
    const m = value.match(/^(\D*?)(\d[\d,]*)(\D*)$/);
    if (m) {
      const n = Number(m[2]!.replace(/,/g, ''));
      return (
        <>
          {m[1]}
          <CountUp value={n} />
          {m[3]}
        </>
      );
    }
  }
  return <>{value}</>;
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <Stagger className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</Stagger>;
}

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tint = 'blue',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  tint?: keyof typeof tints;
}) {
  const t = tints[tint];
  return (
    <StaggerItem
      hover
      className="group border-line bg-card relative overflow-hidden rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-lg sm:p-6"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity group-hover:opacity-100',
          t.glow,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-muted text-[13.5px]">{label}</p>
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
            t.chip,
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <p className="text-ink relative mt-2 text-[28px] leading-none font-bold tracking-tight tabular-nums">
        <Figure value={value} />
      </p>
      {sub && <p className="relative mt-3 text-[12.5px] font-semibold text-green-700 dark:text-green-400">{sub}</p>}
    </StaggerItem>
  );
}
