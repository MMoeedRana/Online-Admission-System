import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const styles = {
  info: [
    'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-500/25',
    Info,
  ],
  warning: [
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/25',
    AlertTriangle,
  ],
  success: [
    'bg-green-50 text-green-800 border-green-200 dark:bg-green-500/10 dark:text-green-200 dark:border-green-500/25',
    CheckCircle2,
  ],
  error: ['bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/25', XCircle],
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof styles;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const [cls, Icon] = styles[tone];
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3.5 text-[13px]', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
