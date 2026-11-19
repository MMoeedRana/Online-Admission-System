'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { useInstKey } from '@/features/institution/hooks';
import { get } from '@/lib/api';
import type { Campaign } from '@/lib/types';

/** The campaign shown on merit screens; kept in the address (?campaign=) so links can be shared. */
export function useCampaign() {
  const key = useInstKey();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const list = useQuery({ queryKey: key('campaigns'), queryFn: () => get<Campaign[]>('/campaigns') });
  const campaigns = (list.data ?? []).filter((c) => c.status !== 'DRAFT');
  // Default: the most recent closed campaign (merit lists are prepared after closing), else the latest.
  const fallback = campaigns.find((c) => c.status === 'CLOSED') ?? campaigns[0];
  const id = sp.get('campaign') ?? fallback?._id ?? '';
  const campaign = campaigns.find((c) => c._id === id) ?? null;
  const select = (next: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set('campaign', next);
    router.replace(`${pathname}?${q.toString()}`);
  };
  return { campaigns, campaign, id, select, loading: list.isLoading };
}

export function CampaignPicker({
  value,
  campaigns,
  onChange,
}: {
  value: string;
  campaigns: Campaign[];
  onChange: (id: string) => void;
}) {
  const current = campaigns.find((c) => c._id === value);
  return (
    <div className="flex items-center gap-2">
      <Select
        className="h-10 min-w-56"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Admission campaign"
      >
        {campaigns.map((c) => (
          <option key={c._id} value={c._id}>
            {c.title} ({c.code})
          </option>
        ))}
      </Select>
      {current && <StatusBadge status={current.status} />}
    </div>
  );
}
