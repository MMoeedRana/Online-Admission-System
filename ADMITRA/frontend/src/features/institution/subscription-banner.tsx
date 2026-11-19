'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { get } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/features/auth/auth-context';

interface Sub {
  state: 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'NONE';
  subscription: { endsAt: string | null; isTrial: boolean };
}

/** INST-4: warns staff during the grace period and when the workspace is read-only. */
export function SubscriptionBanner() {
  const { current } = useAuth();
  const q = useQuery({
    queryKey: ['inst', current?.institutionId, 'subscription'],
    queryFn: () => get<Sub>('/institution/subscription'),
    enabled: Boolean(current),
  });
  if (!q.data || (q.data.state !== 'GRACE' && q.data.state !== 'READ_ONLY')) return null;
  const readOnly = q.data.state === 'READ_ONLY';
  return (
    <div className={readOnly ? 'bg-red-600 text-white' : 'bg-amber-500 text-amber-950'}>
      <p className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold sm:px-6 lg:px-8">
        <AlertTriangle className="size-4 shrink-0" />
        {readOnly
          ? 'The subscription has expired. The workspace is read-only until it is renewed. No data has been deleted.'
          : `The subscription ended on ${formatDate(q.data.subscription.endsAt)}. Please renew within the 7-day grace period to avoid read-only mode.`}
      </p>
    </div>
  );
}
