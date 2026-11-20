'use client';

import { cn } from '@/lib/utils';

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition',
            value === t.value ? 'border-primary bg-primary text-white' : 'border-line bg-card text-body hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 text-[11px]',
                value === t.value ? 'bg-white text-[var(--primary)]' : 'bg-card-soft text-muted',
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
