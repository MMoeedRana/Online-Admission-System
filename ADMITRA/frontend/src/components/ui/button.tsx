import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

const variants = {
  primary: 'bg-primary text-white shadow-button hover:bg-primary-hover',
  secondary: 'border border-line bg-card text-ink hover:bg-card-soft',
  ghost: 'text-body hover:bg-card-soft hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-green-600 text-white hover:bg-green-700',
  soft: 'bg-primary-soft text-primary hover:brightness-95',
};
const sizes = {
  sm: 'h-9 px-3.5 text-[13px] rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
  icon: 'size-10 rounded-xl',
};

export type ButtonVariant = keyof typeof variants;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  loading?: boolean;
  icon?: ReactNode;
}

export function buttonClass(variant: ButtonVariant = 'primary', size: keyof typeof sizes = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-60',
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  icon,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof sizes; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
