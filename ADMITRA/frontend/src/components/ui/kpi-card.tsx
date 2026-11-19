import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';

const tints = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  green: 'bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  purple: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
};

/** Key figure card used on dashboards (as in the reference designs). */
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
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted text-[13.5px]">{label}</p>
        <span className={cn('flex size-11 items-center justify-center rounded-xl', tints[tint])}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="text-ink mt-2 text-[28px] leading-none font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-3 text-[12.5px] font-semibold text-green-600 dark:text-green-400">{sub}</p>}
    </Card>
  );
}
