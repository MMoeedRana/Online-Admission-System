'use client';

import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/features/auth/auth-context';
import { getPaged } from '@/lib/api';
import { DEGREE_LEVELS } from '@/lib/constants';
import { formatMoney } from '@/lib/format';
import type { Program } from '@/lib/types';
import { useInstKey } from './hooks';

const seatsOf = (p: Program) => p.shifts.reduce((s, x) => s + x.seats, 0);

export function ProgramsList() {
  const sp = useSearchParams();
  const router = useRouter();
  const key = useInstKey();
  const { can } = useAuth();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState('ACTIVE');
  const [degreeLevel, setDegree] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: key('programs', q, status, degreeLevel, page),
    queryFn: () =>
      getPaged<Program>('/programs', {
        q: q || undefined,
        status: status || undefined,
        degreeLevel: degreeLevel || undefined,
        page,
      }),
  });

  return (
    <>
      <PageHeader
        title="Programs"
        subtitle="Programs with shifts, seats, eligibility and fees"
        actions={
          can('programs.manage') ? (
            <ButtonLink href="/institution/programs/new" icon={<Plus className="size-4" />}>
              Add program
            </ButtonLink>
          ) : undefined
        }
      />
      <Card className="overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr] sm:p-5">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title or code"
            aria-label="Search programs"
          />
          <Select
            value={degreeLevel}
            onChange={(e) => (setDegree(e.target.value), setPage(1))}
            aria-label="Degree level"
          >
            <option value="">All degrees</option>
            {Object.entries(DEGREE_LEVELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
            <option value="">All</option>
          </Select>
        </div>
        <DataTable
          loading={list.isPending}
          rows={list.data?.data ?? []}
          rowKey={(p) => p._id}
          onRowClick={(p) => router.push(`/institution/programs/${p._id}`)}
          empty={
            <EmptyState
              icon={GraduationCap}
              title="No programs found"
              text="Add your first program or change the filters."
            />
          }
          columns={[
            {
              key: 'title',
              header: 'Program',
              primary: true,
              cell: (p) => (
                <div>
                  <p className="text-ink font-semibold">{p.title}</p>
                  <p className="text-muted text-[12px]">
                    {typeof p.departmentId === 'object' ? p.departmentId.name : ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'code',
              header: 'Code',
              cell: (p) => (
                <Badge tone="gray" dot={false}>
                  {p.code}
                </Badge>
              ),
            },
            { key: 'level', header: 'Degree', cell: (p) => DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] },
            { key: 'seats', header: 'Seats', cell: (p) => seatsOf(p) },
            { key: 'fee', header: 'Admission fee', cell: (p) => formatMoney(p.admissionFee) },
            { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} className="border-line border-t" />
      </Card>
    </>
  );
}
