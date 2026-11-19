'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSession, post, refreshSession, setAccessToken, setInstitutionHeader } from '@/lib/api';
import type { Membership, Session, User } from '@/lib/types';

type Status = 'loading' | 'authenticated' | 'guest';

interface AuthState {
  status: Status;
  user: User | null;
  memberships: Membership[];
  current: Membership | null;
  selectInstitution: (id: string) => void;
  applySession: (s: Session) => void;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  updateUser: (u: User) => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = 'admitra.institution';
/** Set while this browser has a session, so visitors are not sent to the refresh endpoint. */
const SIGNED_IN_KEY = 'admitra.signedIn';

function setSignedIn(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* storage unavailable */
  }
}

function wasSignedIn() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return true;
  }
}

function readStoredInstitution() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Where each user lands after signing in (AUTH-6). */
export function homeFor(user: User, memberships: Membership[]): string {
  if (user.platformRole === 'SUPER_ADMIN') return '/platform/dashboard';
  if (user.accountType === 'APPLICANT') return '/applicant/dashboard';
  if (memberships.length) return '/institution/dashboard';
  return '/no-workspace';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const applySession = useCallback((s: Session | null) => {
    setSignedIn(Boolean(s));
    if (!s) {
      setAccessToken(null);
      setUser(null);
      setMemberships([]);
      setCurrentId(null);
      setInstitutionHeader(null);
      setStatus('guest');
      return;
    }
    setAccessToken(s.accessToken);
    setUser(s.user);
    setMemberships(s.memberships);
    const stored = readStoredInstitution();
    const chosen = s.memberships.find((m) => m.institutionId === stored) ?? s.memberships[0] ?? null;
    setCurrentId(chosen?.institutionId ?? null);
    setInstitutionHeader(chosen?.institutionId ?? null);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    onSession((s) => {
      if (!s) applySession(null);
    });
    if (wasSignedIn()) refreshSession().then(applySession);
    else queueMicrotask(() => applySession(null));
  }, [applySession]);

  const selectInstitution = useCallback(
    (id: string) => {
      setCurrentId(id);
      setInstitutionHeader(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* storage unavailable */
      }
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'inst' });
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const s = await post<Session>('/auth/login', { email, password });
      applySession(s);
      return s;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    applySession(null);
    queryClient.clear();
    router.replace('/login');
  }, [applySession, queryClient, router]);

  const current = memberships.find((m) => m.institutionId === currentId) ?? null;

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      memberships,
      current,
      selectInstitution,
      applySession,
      login,
      logout,
      updateUser: setUser,
      can: (p) => Boolean(current?.permissions.includes(p)),
    }),
    [status, user, memberships, current, selectInstitution, applySession, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
