'use client';

import Link from 'next/link';
import { useBrand } from '@/features/branding/brand-context';
import { cn } from '@/lib/utils';

export function LogoMark({ className, src, name }: { className?: string; src?: string; name?: string }) {
  const brand = useBrand();
  const url = src ?? brand.logoUrl;
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cn('size-9 shrink-0 rounded-xl object-contain', className)} />;
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[#22B3E6] text-[17px] font-extrabold text-white shadow-[0_4px_12px_var(--ring)]',
        className,
      )}
    >
      {(name ?? brand.platformName).trim().charAt(0).toUpperCase() || 'A'}
    </span>
  );
}

export function Logo({ href = '/', light = false, className }: { href?: string; light?: boolean; className?: string }) {
  const brand = useBrand();
  return (
    <Link href={href} className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('truncate text-[19px] font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>
        {brand.platformName}
      </span>
    </Link>
  );
}
