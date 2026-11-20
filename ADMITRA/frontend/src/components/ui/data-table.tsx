import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  primary?: boolean;
  hideOnMobile?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  loading?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty, loading }: Props<T>) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card-soft h-12 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }
  if (!rows.length) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <>
      <div className="hidden overflow-x-auto md:block" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-line bg-card-soft border-y">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'text-muted px-4 py-3 text-[11.5px] font-semibold tracking-wider uppercase first:pl-6 last:pr-6',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('border-line border-b last:border-0', onRowClick && 'hover:bg-card-soft cursor-pointer')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3.5 align-middle first:pl-6 last:pr-6', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-line divide-y md:hidden">
        {rows.map((r) => (
          <li
            key={rowKey(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={cn('px-4 py-4', onRowClick && 'active:bg-card-soft cursor-pointer')}
          >
            <div className="text-ink font-semibold">{primary.cell(r)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-muted text-[11px] font-semibold tracking-wide uppercase">{c.header}</dt>
                  <dd className="mt-0.5 text-[13px] break-words">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
