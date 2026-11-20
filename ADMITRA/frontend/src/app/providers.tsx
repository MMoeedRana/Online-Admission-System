'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { NotificationSocket } from '@/features/notifications/notifications';
import { BrandProvider } from '@/features/branding/brand-context';
import { PlatformBrandStyle } from '@/features/branding/brand-style';
import type { Brand } from '@/lib/brand';

let browserClient: QueryClient | undefined;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  });
}

function getQueryClient() {
  if (typeof window === 'undefined') return makeClient();
  browserClient ??= makeClient();
  return browserClient;
}

export function Providers({ children, brand }: { children: ReactNode; brand: Brand }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={getQueryClient()}>
        <BrandProvider initial={brand}>
          <PlatformBrandStyle />
          <AuthProvider>
            <MotionConfig reducedMotion="user">{children}</MotionConfig>
            <NotificationSocket />
            <Toaster />
          </AuthProvider>
        </BrandProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
