'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { get } from '@/lib/api';
import { DEFAULT_BRAND, type Brand } from '@/lib/brand';

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

export const brandKey = ['branding'] as const;

export function BrandProvider({ initial, children }: { initial: Brand; children: ReactNode }) {
  const q = useQuery({
    queryKey: brandKey,
    queryFn: () => get<Brand>('/public/branding'),
    initialData: initial,
    staleTime: 30_000,
  });
  return <BrandContext.Provider value={q.data ?? initial}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
