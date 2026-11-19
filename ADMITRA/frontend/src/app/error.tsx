'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
        <AlertTriangle className="size-8" />
      </span>
      <h1 className="mt-5 text-[22px] font-bold">Something went wrong</h1>
      <p className="text-muted mt-2 max-w-sm text-[14px]">
        Please try again. If the problem continues, contact support.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
