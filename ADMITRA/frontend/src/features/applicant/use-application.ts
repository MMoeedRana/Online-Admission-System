'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from '@/lib/api';
import type { AppDetail } from './types';

export function useApplication(id: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'application', id], queryFn: () => get<AppDetail>(`/me/applications/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });
  return { ...q, refresh };
}
