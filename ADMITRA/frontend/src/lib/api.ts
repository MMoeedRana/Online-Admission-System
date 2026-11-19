'use client';

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { Session } from './types';

/**
 * One shared Axios instance (Section 2.1.1 of the proposal):
 *  - adds the access token (kept only in memory) and the selected institution to every request
 *  - refreshes the access token once when it expires and repeats the request
 */
export const api = axios.create({ baseURL: '/api/v1', withCredentials: true, timeout: 20000 });

let accessToken: string | null = null;
let institutionId: string | null = null;
let refreshing: Promise<Session | null> | null = null;
let onSessionChange: ((s: Session | null) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setInstitutionHeader(id: string | null) {
  institutionId = id;
}
export function onSession(cb: (s: Session | null) => void) {
  onSessionChange = cb;
}

export async function refreshSession(): Promise<Session | null> {
  refreshing ??= axios
    .post<{ data: Session }>('/api/v1/auth/refresh', {}, { withCredentials: true })
    .then((r) => {
      setAccessToken(r.data.data.accessToken);
      return r.data.data;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (institutionId) config.headers['X-Institution-Id'] = institutionId;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const session = await refreshSession();
      onSessionChange?.(session);
      if (session) {
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: { fields?: Record<string, string> } & Record<string, unknown> };
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  const e = err as AxiosError<ApiErrorBody>;
  if (e?.response?.data?.error?.message) return e.response.data.error.message;
  if (e?.code === 'ERR_NETWORK') return 'Cannot reach the server. Please check your connection.';
  return fallback;
}

export function fieldErrors(err: unknown): Record<string, string> {
  return (err as AxiosError<ApiErrorBody>)?.response?.data?.error?.details?.fields ?? {};
}

export function errorCode(err: unknown): string | undefined {
  return (err as AxiosError<ApiErrorBody>)?.response?.data?.error?.code;
}

/** Unwraps the { success, data, meta } envelope. */
export async function get<T>(url: string, params?: object): Promise<T> {
  const r = await api.get<{ data: T }>(url, { params });
  return r.data.data;
}
export async function getPaged<T>(url: string, params?: object) {
  const r = await api.get<{ data: T[]; meta: import('./types').PageMeta }>(url, { params });
  return { data: r.data.data, meta: r.data.meta };
}
export async function post<T>(url: string, body?: object): Promise<T> {
  const r = await api.post<{ data: T }>(url, body ?? {});
  return r.data.data;
}
export async function patch<T>(url: string, body?: object): Promise<T> {
  const r = await api.patch<{ data: T }>(url, body ?? {});
  return r.data.data;
}
export async function put<T>(url: string, body?: object): Promise<T> {
  const r = await api.put<{ data: T }>(url, body ?? {});
  return r.data.data;
}
export async function del<T>(url: string): Promise<T> {
  const r = await api.delete<{ data: T }>(url);
  return r.data.data;
}
