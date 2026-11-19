import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1F6FEB] to-[#22B3E6] text-[17px] font-extrabold text-white shadow-[0_4px_12px_rgba(31,111,235,0.35)]',
        className,
      )}
    >
      A
    </span>
  );
}

export function Logo({ href = '/', light = false, className }: { href?: string; light?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5', className)} aria-label="ADMITRA home">
      <LogoMark />
      <span className={cn('text-[19px] font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>
        ADMITRA
      </span>
    </Link>
  );
}
