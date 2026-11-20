'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { errorMessage, fieldErrors, getPaged, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { PageMeta } from '@/lib/types';
import { AlertTriangle, CheckCircle2, Hourglass, Inbox } from 'lucide-react';
import { PriorityBadge, ResponseBadge, TicketStatusBadge } from './badges';
import { base, CATEGORIES, pageBase, PRIORITIES, relative, type Side, type Ticket } from './types';
import { useBrand } from '@/features/branding/brand-context';

type TabKey = 'ACTIVE' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_INSTITUTION' | 'RESOLVED' | 'CLOSED' | 'ALL';
type Meta = PageMeta & { counts: Record<string, number> };

export function TicketList({ side }: { side: Side }) {
  const brand = useBrand();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(side === 'platform' ? 'ACTIVE' : 'ALL');
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['support', side, tab, q, priority, overdue, page],
    queryFn: () =>
      getPaged<Ticket>(base(side), {
        status: tab === 'ALL' ? undefined : tab,
        q: q || undefined,
        priority: priority || undefined,
        overdue: overdue || undefined,
        page,
      }),
    placeholderData: (p) => p,
  });
  const counts = (list.data?.meta as Meta | undefined)?.counts ?? {};
  const active = (counts.OPEN ?? 0) + (counts.IN_PROGRESS ?? 0) + (counts.WAITING_ON_INSTITUTION ?? 0);
  const now = list.dataUpdatedAt;

  return (
    <>
      <PageHeader
        title={side === 'platform' ? 'Support tickets' : 'Support'}
        subtitle={
          side === 'platform'
            ? 'Tickets from every institution, with first-response targets of 2, 8, 24 and 72 hours'
            : `Ask the ${brand.platformName} team for help. Only your institution can see its tickets.`
        }
        actions={
          side === 'institution' ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New ticket
            </Button>
          ) : undefined
        }
      />
      <KpiGrid className="mb-6">
        <KpiCard
          label="Active tickets"
          value={active}
          sub={`${counts.OPEN ?? 0} waiting for a first look`}
          icon={Inbox}
        />
        <KpiCard
          label="Response overdue"
          value={counts.overdue ?? 0}
          sub="Past the target of their priority"
          icon={AlertTriangle}
          tint="amber"
        />
        <KpiCard
          label="Waiting on institution"
          value={counts.WAITING_ON_INSTITUTION ?? 0}
          sub="Need an answer from the institution"
          icon={Hourglass}
          tint="purple"
        />
        <KpiCard
          label="Resolved or closed"
          value={(counts.RESOLVED ?? 0) + (counts.CLOSED ?? 0)}
          sub={`${counts.CLOSED ?? 0} confirmed and closed`}
          icon={CheckCircle2}
          tint="green"
        />
      </KpiGrid>
      <Card className="overflow-hidden">
        <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-[1fr_auto] xl:items-center">
          <Tabs
            value={tab}
            onChange={(v) => (setTab(v), setPage(1))}
            tabs={[
              { value: 'ACTIVE', label: 'Active', count: active },
              { value: 'OPEN', label: 'Open', count: counts.OPEN ?? 0 },
              { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS ?? 0 },
              { value: 'WAITING_ON_INSTITUTION', label: 'Waiting', count: counts.WAITING_ON_INSTITUTION ?? 0 },
              { value: 'RESOLVED', label: 'Resolved', count: counts.RESOLVED ?? 0 },
              { value: 'CLOSED', label: 'Closed', count: counts.CLOSED ?? 0 },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_170px] xl:w-[460px]">
            <Input
              value={q}
              onChange={(e) => (setQ(e.target.value), setPage(1))}
              placeholder="Search ticket number or subject"
              aria-label="Search tickets"
            />
            <Select
              value={priority}
              onChange={(e) => (setPriority(e.target.value), setPage(1))}
              aria-label="Filter by priority"
            >
              <option value="">Any priority</option>
              {Object.entries(PRIORITIES).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label} ({p.hours} h)
                </option>
              ))}
            </Select>
          </div>
          {side === 'platform' && (
            <label className="text-body inline-flex w-fit items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={overdue}
                onChange={(e) => (setOverdue(e.target.checked), setPage(1))}
              />
              Only tickets with an overdue first response
            </label>
          )}
        </div>
        <DataTable
          loading={list.isLoading}
          rows={list.data?.data ?? []}
          rowKey={(t) => t._id}
          onRowClick={(t) => router.push(`${pageBase(side)}/${t._id}`)}
          empty={
            <EmptyState
              icon={LifeBuoy}
              title="No tickets here"
              text={
                side === 'institution'
                  ? `Open a ticket when you need help from the ${brand.platformName} team.`
                  : 'Nothing matches these filters.'
              }
            />
          }
          columns={[
            {
              key: 'subject',
              header: 'Ticket',
              primary: true,
              cell: (t) => (
                <div className="min-w-0">
                  <p className="text-ink font-semibold">{t.subject}</p>
                  <p className="text-muted text-[12px]">
                    {t.ticketNumber} · {CATEGORIES[t.category]}
                    {side === 'platform' && t.institution && ` · ${t.institution.shortName || t.institution.name}`}
                  </p>
                </div>
              ),
            },
            { key: 'priority', header: 'Priority', cell: (t) => <PriorityBadge priority={t.priority} /> },
            { key: 'status', header: 'Status', cell: (t) => <TicketStatusBadge status={t.status} /> },
            { key: 'response', header: 'First response', cell: (t) => <ResponseBadge t={t} now={now} /> },
            {
              key: 'activity',
              header: 'Last activity',
              cell: (t) => (
                <span title={formatDateTime(t.lastActivityAt)} className="text-body whitespace-nowrap">
                  {relative(t.lastActivityAt, now)} · {t.messageCount} msg
                </span>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </Card>
      {side === 'institution' && <NewTicket open={creating} onClose={() => setCreating(false)} />}
    </>
  );
}

function NewTicket({ open, onClose }: { open: boolean; onClose: () => void }) {
  const brand = useBrand();
  const qc = useQueryClient();
  const router = useRouter();
  const empty = { subject: '', category: '', priority: 'NORMAL', message: '' };
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => post<Ticket>('/support/tickets', v),
    onSuccess: async (t) => {
      toast.success(`Ticket ${t.ticketNumber} opened. The ${brand.platformName} team has been notified.`);
      setV(empty);
      onClose();
      await qc.invalidateQueries({ queryKey: ['support'] });
      router.push(`/institution/support/${t._id}`);
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New support ticket"
      description="Describe the problem clearly. The priority sets how quickly the team replies first."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Open ticket
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="tk-subject" required error={errors.subject} className="sm:col-span-2">
          <Input
            id="tk-subject"
            placeholder="e.g. Applicants cannot open the challan PDF"
            value={v.subject}
            onChange={set('subject')}
            maxLength={150}
          />
        </Field>
        <Field label="Category" htmlFor="tk-category" required error={errors.category}>
          <Select id="tk-category" value={v.category} onChange={set('category')}>
            <option value="" disabled>
              Choose a category
            </option>
            {Object.entries(CATEGORIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="tk-priority" hint="First-response target in brackets">
          <Select id="tk-priority" value={v.priority} onChange={set('priority')}>
            {Object.entries(PRIORITIES).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label} (reply within {p.hours} hours)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message" htmlFor="tk-message" required error={errors.message} className="sm:col-span-2">
          <Textarea
            id="tk-message"
            rows={6}
            placeholder="What happened, where, and since when? Add application or challan numbers if they help."
            value={v.message}
            onChange={set('message')}
            maxLength={5000}
          />
        </Field>
      </div>
    </Modal>
  );
}
