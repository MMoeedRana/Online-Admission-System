import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/lib/types';
import { cn } from '@/lib/utils';

export function Pagination({
  meta,
  onPage,
  className,
}: {
  meta?: PageMeta;
  onPage: (p: number) => void;
  className?: string;
}) {
  if (!meta || meta.pages <= 1) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  const btn =
    'inline-flex size-9 items-center justify-center rounded-lg border border-line bg-card text-ink disabled:opacity-40';
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-3 sm:px-6', className)}>
      <p className="text-muted text-[12.5px]">
        {from}-{to} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <button
          className={btn}
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-ink text-[13px] font-semibold">
          {meta.page} / {meta.pages}
        </span>
        <button
          className={btn}
          disabled={meta.page >= meta.pages}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
