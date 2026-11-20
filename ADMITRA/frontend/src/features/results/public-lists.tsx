'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, ListChecks, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { FullPageLoader } from '@/components/ui/spinner';
import { getPaged } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ListItem {
  _id: string;
  listNumber: number;
  revision: number;
  publishedAt: string;
  offerDeadline: string;
  selected: number;
  waitlisted: number;
  programs: string[];
  institution: { name: string; shortName: string; city: string };
  campaign: { title: string; code: string };
}

export function PublicMeritLists() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['public', 'merit-lists', q, page],
    queryFn: () => getPaged<ListItem>('/public/merit-lists', { q: q || undefined, page }),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader
        title="Published merit lists"
        subtitle="Search your name or application number. Names are shortened and CNIC numbers are never shown."
        actions={
          <ButtonLink href="/status" variant="secondary">
            Check application status
          </ButtonLink>
        }
      />
      <Card className="mb-5 p-4">
        <label className="relative block max-w-xl">
          <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            className="pl-10"
            placeholder="Search by institution"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
            aria-label="Search institution"
          />
        </label>
      </Card>
      {list.data && list.data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No merit lists published yet"
            text="Lists appear here as soon as an institution publishes them."
          />
        </Card>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" gap={0.05}>
          {(list.data?.data ?? []).map((l) => (
            <StaggerItem key={l._id} hover className="h-full min-w-0">
              <Link href={`/merit-lists/${l._id}`} className="block h-full">
                <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate text-[15.5px] font-bold">{l.institution.name}</p>
                      <p className="text-muted text-[13px]">
                        {l.campaign.title} · {l.institution.city}
                      </p>
                    </div>
                    <span className="bg-primary-soft text-primary flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none">
                      <span className="text-[10px] font-semibold uppercase">List</span>
                      <span className="text-[19px] font-extrabold">{l.listNumber}</span>
                    </span>
                  </div>
                  <p className="text-body mt-3 line-clamp-2 text-[13px]">{l.programs.join(' · ')}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge tone="green">{l.selected} selected</Badge>
                    {l.waitlisted > 0 && <Badge tone="amber">{l.waitlisted} waiting</Badge>}
                    {l.revision > 1 && <Badge tone="blue">Revision {l.revision}</Badge>}
                  </div>
                  <p className="text-muted mt-auto pt-4 text-[12.5px]">Published {formatDateTime(l.publishedAt)}</p>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <Pagination meta={list.data?.meta} onPage={setPage} className="mt-6" />
    </>
  );
}

interface Entry {
  _id: string;
  applicationNumber: string;
  shortName: string;
  program: string;
  programId: string;
  shift: string;
  aggregate: number;
  meritPosition: number;
  outcome: 'SELECTED' | 'WAITLISTED' | 'NOT_SELECTED';
  waitingPosition: number | null;
}
interface Detail {
  list: {
    _id: string;
    listNumber: number;
    revision: number;
    status: string;
    publishedAt: string;
    offerDeadline: string;
    pools: {
      programId: string;
      programTitle: string;
      shift: string;
      capacity: number;
      seats: number;
      selected: number;
      closingAggregate: number | null;
      openingAggregate: number | null;
    }[];
  };
  institution: { name: string; city: string };
  campaign: { title: string };
  entries: Entry[];
}

const OUTCOME = {
  SELECTED: { label: 'Selected', tone: 'green' as const },
  WAITLISTED: { label: 'Waiting list', tone: 'amber' as const },
  NOT_SELECTED: { label: 'Not selected', tone: 'gray' as const },
};

export function PublicMeritList({ id }: { id: string }) {
  const [q, setQ] = useState('');
  const [pool, setPool] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);
  const [programId, shift] = pool.split(':');
  const r = useQuery({
    queryKey: ['public', 'merit-list', id, q, pool, outcome, page],
    queryFn: () =>
      getPaged<never>(`/public/merit-lists/${id}`, {
        q: q || undefined,
        programId: programId || undefined,
        shift: shift || undefined,
        outcome: outcome || undefined,
        page,
        limit: 50,
      }),
    placeholderData: (p) => p,
  });
  const d = r.data?.data as unknown as Detail | undefined;
  if (!d) return <FullPageLoader />;
  return (
    <>
      <PageHeader
        title={`${d.institution.name}: merit list ${d.list.listNumber}`}
        subtitle={`${d.campaign.title} · published ${formatDate(d.list.publishedAt)} · offers open until ${formatDate(d.list.offerDeadline)}`}
        crumbs={[{ label: 'Merit lists', href: '/merit-lists' }, { label: `List ${d.list.listNumber}` }]}
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={() => window.open(`/api/v1/public/merit-lists/${id}/pdf`, '_blank')}
          >
            Download PDF
          </Button>
        }
      />
      {d.list.status === 'SUPERSEDED' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          This list was corrected by a later revision.
        </p>
      )}
      <Stagger className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" gap={0.05}>
        {d.list.pools.map((p) => (
          <StaggerItem key={`${p.programId}:${p.shift}`}>
            <button
              onClick={() => (
                setPool(pool === `${p.programId}:${p.shift}` ? '' : `${p.programId}:${p.shift}`),
                setPage(1)
              )}
              className={cn(
                'w-full rounded-2xl border p-4 text-left transition hover:shadow-md',
                pool === `${p.programId}:${p.shift}` ? 'border-primary bg-primary-soft' : 'border-line bg-card',
              )}
            >
              <p className="text-ink truncate text-[14px] font-bold">{p.programTitle}</p>
              <p className="text-muted text-[12px]">
                {p.shift.toLowerCase()} shift · {p.selected} selected
              </p>
              <p className="text-ink mt-2 text-[13px]">
                Closing aggregate <b className="text-[17px] tabular-nums">{p.closingAggregate?.toFixed(2) ?? '-'}</b>
              </p>
            </button>
          </StaggerItem>
        ))}
      </Stagger>
      <Card className="overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr] sm:p-5">
          <label className="relative">
            <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              className="pl-10"
              placeholder="Search name or application number"
              value={q}
              onChange={(e) => (setQ(e.target.value), setPage(1))}
              aria-label="Search the list"
            />
          </label>
          <Select value={outcome} onChange={(e) => (setOutcome(e.target.value), setPage(1))} aria-label="Result">
            <option value="">All results</option>
            <option value="SELECTED">Selected</option>
            <option value="WAITLISTED">Waiting list</option>
            <option value="NOT_SELECTED">Not selected</option>
          </Select>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead>
              <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                <th className="px-5 py-3 font-semibold">Position</th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Application</th>
                <th className="px-3 py-3 font-semibold">Program</th>
                <th className="px-3 py-3 font-semibold">Aggregate</th>
                <th className="px-5 py-3 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e) => (
                <tr key={e._id} className="border-line border-b last:border-0">
                  <td className="text-ink px-5 py-3 font-bold tabular-nums">{e.meritPosition}</td>
                  <td className="text-ink px-3 py-3 font-semibold">{e.shortName}</td>
                  <td className="px-3 py-3 font-mono text-[12.5px]">{e.applicationNumber}</td>
                  <td className="px-3 py-3">
                    {e.program} <span className="text-muted">({e.shift.toLowerCase()})</span>
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{e.aggregate.toFixed(2)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={OUTCOME[e.outcome].tone}>
                      {OUTCOME[e.outcome].label}
                      {e.outcome === 'WAITLISTED' && e.waitingPosition ? ` #${e.waitingPosition}` : ''}
                    </Badge>
                  </td>
                </tr>
              ))}
              {d.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted px-5 py-10 text-center">
                    No matching names in this list.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination meta={r.data?.meta} onPage={setPage} className="p-4" />
      </Card>
    </>
  );
}
