import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  green: 'bg-green-50 text-green-700 ring-green-600/15 dark:bg-green-500/10 dark:text-green-400',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-400',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-500/15 dark:text-slate-300',
};
export type Tone = keyof typeof tones;

export function Badge({
  tone = 'gray',
  dot = true,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string]> = {
  ACTIVE: ['green', 'Active'],
  PENDING: ['amber', 'Pending'],
  SUSPENDED: ['red', 'Suspended'],
  REJECTED: ['red', 'Rejected'],
  INVITED: ['amber', 'Invited'],
  DISABLED: ['gray', 'Disabled'],
  DRAFT: ['gray', 'Draft'],
  OPEN: ['green', 'Open'],
  CLOSED: ['amber', 'Closed'],
  ARCHIVED: ['gray', 'Archived'],
  RETIRED: ['gray', 'Retired'],
  GRACE: ['amber', 'Grace period'],
  READ_ONLY: ['red', 'Read-only'],
  NONE: ['gray', 'No subscription'],
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [tone, text] = STATUS[status] ?? ['gray', status];
  return <Badge tone={tone}>{label ?? text}</Badge>;
}
