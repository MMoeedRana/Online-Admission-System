'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Band } from './types';

export const BANDS: Record<Band, { label: string; short: string; tone: string; ring: string; text: string }> = {
  SAFE: {
    label: 'Safe',
    short: 'Safe',
    tone: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-300',
    ring: '#16A34A',
    text: '85% chance or more',
  },
  TARGET: {
    label: 'Target',
    short: 'Target',
    tone: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300',
    ring: '#1F6FEB',
    text: '50% to 85%',
  },
  REACH: {
    label: 'Reach',
    short: 'Reach',
    tone: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
    ring: '#D97706',
    text: '20% to 50%',
  },
  UNLIKELY: {
    label: 'Unlikely',
    short: 'Unlikely',
    tone: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300',
    ring: '#DC2626',
    text: 'below 20%',
  },
  INSUFFICIENT_DATA: {
    label: 'Insufficient data',
    short: 'No data',
    tone: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300',
    ring: '#94A3B8',
    text: 'no verified merit history',
  },
  NOT_ELIGIBLE: {
    label: 'Not eligible',
    short: 'Not eligible',
    tone: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300',
    ring: '#94A3B8',
    text: 'requirements not met',
  },
};

export function BandBadge({ band, className }: { band: Band; className?: string }) {
  const b = BANDS[band];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ring-inset',
        b.tone,
        className,
      )}
    >
      {b.label}
    </span>
  );
}

/** Animated ring with the chance in the middle (PRED-6: shown between 1% and 99%). */
export function ChanceRing({ chance, band, size = 64 }: { chance: number | null; band: Band; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const value = chance ?? 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={6} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={BANDS[band].ring}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c - (c * value) / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="text-ink absolute inset-0 flex items-center justify-center text-[14px] font-extrabold tabular-nums">
        {chance == null ? '-' : `${chance}%`}
      </span>
    </div>
  );
}

export const STANDING: Record<string, string> = {
  TOP_10: 'Top 10% of applicants with verified marks',
  TOP_25: 'Top 25% of applicants with verified marks',
  TOP_50: 'Top 50% of applicants with verified marks',
  LOWER: 'Lower half of applicants with verified marks',
};
