import { CloudOff } from 'lucide-react';

export function ServiceUnavailable({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
        <CloudOff className="size-7" />
      </span>
      <h2 className="mt-4 text-[18px] font-bold">Information is not available right now</h2>
      <p className="text-muted mt-1 text-[13.5px]">{message ?? 'Please refresh the page in a moment.'}</p>
    </div>
  );
}
