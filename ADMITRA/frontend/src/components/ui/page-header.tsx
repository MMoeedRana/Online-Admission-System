import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="text-muted mb-2 flex flex-wrap items-center gap-1 text-[12.5px]">
            {crumbs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {c.href ? (
                  <Link href={c.href} className="hover:text-primary">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-ink">{c.label}</span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="size-3.5" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1 text-[13.5px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
