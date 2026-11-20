'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, History, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { getPaged } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatDateTime } from '@/lib/format';
import type { PageMeta } from '@/lib/types';

interface Entry {
  _id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, unknown> | null;
  ip: string;
  createdAt: string;
  institution?: { name: string; shortName?: string } | null;
}
type Meta = PageMeta & { actions: string[]; entities: string[] };

const words = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function actionTone(a: string): Tone {
  if (/REJECT|REVOK|DELETE|DISABL|MISMATCH|DISCARD|SUSPEND|CANCEL/.test(a)) return 'red';
  if (/APPROV|VERIFIED|PUBLISH|ACTIVAT|ENROLL|ACCEPT|RESOLV/.test(a)) return 'green';
  if (/CREATED|INVITED|OPENED|SUBMITTED|ADDED|IMPORTED|GENERATED/.test(a)) return 'blue';
  if (/UPDATED|CHANGED|REPLIED|RESET/.test(a)) return 'purple';
  return 'gray';
}

export function AuditLog({ scope }: { scope: 'institution' | 'platform' }) {
  const url = scope === 'platform' ? '/platform/audit-logs' : '/audit-logs';
  const [f, setF] = useState({ q: '', action: '', entity: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Entry | null>(null);
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const list = useQuery({
    queryKey: ['audit', scope, f, page],
    queryFn: () => getPaged<Entry>(url, { ...params, page }),
    placeholderData: (p) => p,
  });
  const meta = list.data?.meta as Meta | undefined;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => (
    setF({ ...f, [k]: e.target.value }),
    setPage(1)
  );
  const filtered = Object.values(f).some(Boolean);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={
          scope === 'platform'
            ? 'Every recorded action on the platform: who, what, when and from where'
            : 'Every recorded action in your institution: who, what, when and from where'
        }
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={() => void downloadFile(`${url}/export.csv?${new URLSearchParams(params)}`, 'audit-log.csv')}
          >
            Export CSV
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[1.4fr_1fr_1fr_150px_150px_auto]">
          <Input
            value={f.q}
            onChange={set('q')}
            placeholder="Search action, person or record id"
            aria-label="Search the audit log"
          />
          <Select value={f.action} onChange={set('action')} aria-label="Filter by action">
            <option value="">All actions</option>
            {meta?.actions.map((a) => (
              <option key={a} value={a}>
                {words(a)}
              </option>
            ))}
          </Select>
          <Select value={f.entity} onChange={set('entity')} aria-label="Filter by record type">
            <option value="">All record types</option>
            {meta?.entities.map((a) => (
              <option key={a} value={a}>
                {a.replace(/([a-z])([A-Z])/g, '$1 $2')}
              </option>
            ))}
          </Select>
          <label className="relative block">
            <span className="text-muted bg-card absolute -top-2 left-3 px-1 text-[11px] font-semibold">From</span>
            <Input type="date" value={f.from} onChange={set('from')} aria-label="From date" placeholder="From date" />
          </label>
          <label className="relative block">
            <span className="text-muted bg-card absolute -top-2 left-3 px-1 text-[11px] font-semibold">To</span>
            <Input type="date" value={f.to} onChange={set('to')} aria-label="To date" placeholder="To date" />
          </label>
          {filtered && (
            <Button
              variant="ghost"
              icon={<X className="size-4" />}
              onClick={() => (setF({ q: '', action: '', entity: '', from: '', to: '' }), setPage(1))}
            >
              Clear
            </Button>
          )}
        </div>
        <DataTable
          loading={list.isLoading}
          rows={list.data?.data ?? []}
          rowKey={(r) => r._id}
          onRowClick={setOpen}
          empty={<EmptyState icon={History} title="No entries" text="Nothing matches these filters." />}
          columns={[
            {
              key: 'action',
              header: 'Action',
              primary: true,
              cell: (r) => <Badge tone={actionTone(r.action)}>{words(r.action)}</Badge>,
            },
            {
              key: 'actor',
              header: 'By',
              cell: (r) => <span className="text-ink font-medium">{r.actorName || 'System'}</span>,
            },
            ...(scope === 'platform'
              ? [
                  {
                    key: 'inst',
                    header: 'Institution',
                    cell: (r: Entry) =>
                      r.institution?.shortName || r.institution?.name || <span className="text-muted">Platform</span>,
                  },
                ]
              : []),
            {
              key: 'entity',
              header: 'Record',
              cell: (r) => (
                <span className="text-body">
                  {r.entity.replace(/([a-z])([A-Z])/g, '$1 $2')}
                  <span className="text-muted block font-mono text-[11px]">{r.entityId.slice(-8)}</span>
                </span>
              ),
            },
            {
              key: 'when',
              header: 'When',
              cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
            },
            {
              key: 'ip',
              header: 'IP address',
              hideOnMobile: true,
              cell: (r) => <span className="text-muted font-mono text-[12px]">{r.ip || '-'}</span>,
            },
          ]}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? words(open.action) : ''}
        description={open ? formatDateTime(open.createdAt) : ''}
        size="lg"
      >
        {open && (
          <div className="space-y-4 text-[13.5px]">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['By', open.actorName || 'System'],
                ['Record type', open.entity],
                ['Record id', open.entityId || '-'],
                ['IP address', open.ip || '-'],
                ...(open.institution ? [['Institution', open.institution.name]] : []),
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-muted text-[12px] font-semibold uppercase">{l}</dt>
                  <dd className="text-ink font-mono text-[12.5px] break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-muted mb-1.5 text-[12px] font-semibold uppercase">Details recorded</p>
              <pre className="bg-card-soft border-line text-ink max-h-80 overflow-auto rounded-xl border p-4 text-[12px] leading-relaxed">
                {open.changes ? JSON.stringify(open.changes, null, 2) : 'No further details.'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
