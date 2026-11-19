'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { patch } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useAuth();
  // true only in the browser after hydration (avoids a theme icon mismatch)
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        setTheme(next);
        if (user) void patch('/auth/me', { theme: next }).catch(() => undefined);
      }}
      className={cn(
        'border-line bg-card text-body hover:text-ink flex size-10 items-center justify-center rounded-xl border',
        className,
      )}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
