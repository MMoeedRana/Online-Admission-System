'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { api, get, getAccessToken, post } from '@/lib/api';
import type { AppNotification } from '@/lib/types';

export const NOTIF_KEY = ['notifications'];

export function useNotifications(limit = 8) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [...NOTIF_KEY, limit],
    queryFn: async () => {
      const r = await api.get<{ data: AppNotification[]; meta: { unread: number; total: number } }>('/notifications', {
        params: { limit },
      });
      return { items: r.data.data, unread: r.data.meta.unread, total: r.data.meta.total };
    },
    enabled: status === 'authenticated',
    refetchInterval: 60_000,
  });
}

export async function markRead(id?: string) {
  if (id) await post(`/notifications/${id}/read`);
  else await post('/notifications/read-all');
}

export function NotificationSocket() {
  const { status, user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    const socket = io({
      path: '/api/v1/socket',
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
    });
    socket.on('notification', (n: AppNotification) => {
      toast.success(n.title);
      void qc.invalidateQueries({ queryKey: NOTIF_KEY });
      void qc.invalidateQueries({ predicate: (q) => ['me', 'inst'].includes(String(q.queryKey[0])) });
    });
    return () => {
      socket.disconnect();
    };
  }, [status, user, qc]);
  return null;
}

export const unreadCount = () => get<{ unread: number }>('/notifications/unread-count');
