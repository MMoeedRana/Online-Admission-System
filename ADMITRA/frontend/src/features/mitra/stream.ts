'use client';

import { getAccessToken, getInstitutionHeader, refreshSession } from '@/lib/api';
import type { StreamEvent } from './types';

export async function streamMessage(url: string, message: string, onEvent: (e: StreamEvent) => void) {
  const call = () =>
    fetch(`/api/v1${url}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        ...(getInstitutionHeader() ? { 'X-Institution-Id': getInstitutionHeader()! } : {}),
      },
      body: JSON.stringify({ message }),
    });
  let res = await call();
  if (res.status === 401 && (await refreshSession())) res = await call();
  if (!res.ok || !res.body) {
    let msg = 'The message could not be sent.';
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {}
    onEvent({ type: 'error', message: msg });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (data) onEvent(JSON.parse(data) as StreamEvent);
    }
  }
}
