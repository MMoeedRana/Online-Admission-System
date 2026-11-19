import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

export function FullPageLoader() {
  return (
    <div className="text-primary flex min-h-[60vh] items-center justify-center">
      <Spinner className="size-7 border-[3px]" />
    </div>
  );
}
