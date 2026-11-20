'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-context';
import { get } from '@/lib/api';
import type { AcademicSession, Campus, Department, Faculty } from '@/lib/types';

export function useInstKey() {
  const { current } = useAuth();
  return (...parts: unknown[]) => ['inst', current?.institutionId, ...parts];
}

export interface Structure {
  campuses: Campus[];
  faculties: Faculty[];
  departments: Department[];
  sessions: AcademicSession[];
}

export function useStructure() {
  const key = useInstKey();
  return useQuery({ queryKey: key('structure'), queryFn: () => get<Structure>('/structure') });
}
