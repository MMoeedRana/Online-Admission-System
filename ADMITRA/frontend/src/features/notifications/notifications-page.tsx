'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AppNotification, PageMeta } from '@/lib/types';
import { cn } from '@/lib/utils';
import { markRead, NOTIF_KEY } from './notifications';

export function NotificationsPage() {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({
    queryKey: [...NOTIF_KEY, 'page', tab, page],
    queryFn: async () => {
      const r = await api.get<{ data: AppNotification[]; meta: PageMeta & { unread: number } }>('/notifications', {
        params: { page, unread: tab === 'unread' ? 'true' : undefined },
      });
      return r.data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: NOTIF_KEY });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Updates about applications, marks verification and payments"
        actions={
          <Button
            variant="secondary"
            icon={<CheckCheck className="size-4" />}
            onClick={async () => (await markRead(), refresh())}
            disabled={!q.data?.meta.unread}
          >
            Mark all read
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => (setTab(v), setPage(1))}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: q.data?.meta.unread },
        ]}
      />
      <Card className="overflow-hidden">
        {q.data && q.data.data.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" text="You will see updates about your work here." />
        ) : (
          <ul className="divide-line divide-y">
            {q.data?.data.map((n) => (
              <li key={n._id}>
                <button
                  className={cn(
                    'hover:bg-card-soft flex w-full gap-3 px-5 py-4 text-left sm:px-6',
                    !n.readAt && 'bg-primary-soft/40',
                  )}
                  onClick={async () => {
                    if (!n.readAt) await markRead(n._id);
                    void refresh();
                    if (n.link) router.push(n.link);
                  }}
                >
                  <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', n.readAt ? 'bg-line' : 'bg-primary')} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block text-[14px] font-semibold">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-[13px]">{n.body}</span>}
                    <span className="text-muted mt-1 block text-[12px]">{formatDateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={q.data?.meta} onPage={setPage} className="border-line border-t" />
      </Card>
    </div>
  );
}
