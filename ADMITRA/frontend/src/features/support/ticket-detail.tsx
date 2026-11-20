'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, CheckCircle2, Send, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { Avatar } from '@/components/layout/user-menu';
import { errorMessage, get, patch, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PriorityBadge, ResponseBadge, TicketStatusBadge } from './badges';
import { base, CATEGORIES, pageBase, PRIORITIES, TICKET_STATUS, type Side, type Ticket } from './types';

/** SUP-3: threaded conversation; each reply notifies the other party. */
export function TicketDetail({ id, side }: { id: string; side: Side }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['support', side, 'ticket', id], queryFn: () => get<Ticket>(`${base(side)}/${id}`) });
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['support'] });
  const send = useMutation({
    mutationFn: () => post<Ticket>(`${base(side)}/${id}/replies`, { message, status: status || undefined }),
    onSuccess: async () => {
      toast.success(
        side === 'platform' ? 'Reply sent. The institution is notified.' : 'Reply sent. The ADMITRA team is notified.',
      );
      setMessage('');
      setStatus('');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: (body: object) =>
      side === 'platform'
        ? patch<Ticket>(`/platform/support/${id}`, body)
        : post<Ticket>(`/support/tickets/${id}/close`),
    onSuccess: async () => {
      toast.success('Ticket updated.');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <FullPageLoader />;
  const t = q.data;
  const mine = side === 'platform' ? 'PLATFORM' : 'INSTITUTION';
  const closed = t.status === 'CLOSED';
  const statusChoices =
    side === 'platform'
      ? (['IN_PROGRESS', 'WAITING_ON_INSTITUTION', 'RESOLVED', 'CLOSED'] as const)
      : (['CLOSED'] as const);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: side === 'platform' ? 'Support tickets' : 'Support', href: pageBase(side) },
          { label: t.ticketNumber },
        ]}
        title={t.subject}
        subtitle={`${t.ticketNumber} · ${CATEGORIES[t.category]} · opened by ${t.openedByName} on ${formatDateTime(t.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={t.priority} />
            <TicketStatusBadge status={t.status} />
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Conversation"
              subtitle={`${t.messages?.length ?? 0} message${t.messages?.length === 1 ? '' : 's'}`}
            />
            <ol className="space-y-4 p-5 sm:p-6">
              {t.messages?.map((m, i) => {
                const own = m.side === mine;
                return (
                  <motion.li
                    key={m._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.05 }}
                    className={cn('flex gap-3', own && 'flex-row-reverse')}
                  >
                    <Avatar name={m.side === 'PLATFORM' ? 'ADMITRA Support' : m.authorName} />
                    <div className={cn('max-w-[min(640px,85%)] min-w-0', own && 'items-end text-right')}>
                      <p className="text-muted text-[12px]">
                        <span className="text-ink font-semibold">{m.authorName}</span>
                        {m.side === 'PLATFORM' ? ' · ADMITRA team' : ' · Institution'} · {formatDateTime(m.createdAt)}
                      </p>
                      <div
                        className={cn(
                          'mt-1 rounded-2xl px-4 py-3 text-left text-[14px] leading-relaxed whitespace-pre-wrap',
                          own
                            ? 'bg-primary rounded-tr-md text-white'
                            : 'bg-card-soft text-ink border-line rounded-tl-md border',
                        )}
                      >
                        {m.body}
                      </div>
                      {m.statusChange && (
                        <p className="text-muted mt-1.5 text-[12px]">
                          Status changed to{' '}
                          <b className="text-ink">{TICKET_STATUS[m.statusChange as Ticket['status']]?.label}</b>
                        </p>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHeader
              title="Reply"
              subtitle={
                side === 'platform'
                  ? 'The institution admins get an in-app notification and an e-mail.'
                  : 'The ADMITRA team gets an in-app notification and an e-mail. Replying reopens a resolved ticket.'
              }
            />
            <div className="space-y-4 p-5 sm:p-6">
              {closed && side === 'platform' ? (
                <Alert tone="info">This ticket is closed. Change its status to reopen it.</Alert>
              ) : (
                <>
                  <Field label="Message" htmlFor="tk-reply">
                    <Textarea
                      id="tk-reply"
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        side === 'platform'
                          ? 'Write your answer to the institution…'
                          : 'Write your reply to the ADMITRA team…'
                      }
                      maxLength={5000}
                    />
                  </Field>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <Field label="Set status with this reply" htmlFor="tk-status" className="sm:w-72">
                      <Select id="tk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">Keep the current status</option>
                        {statusChoices.map((s) => (
                          <option key={s} value={s}>
                            {TICKET_STATUS[s].label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button
                      icon={<Send className="size-4" />}
                      loading={send.isPending}
                      disabled={message.trim().length < 5}
                      onClick={() => send.mutate()}
                    >
                      Send reply
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-line divide-y px-5 pb-3 text-[13.5px] sm:px-6">
              {side === 'platform' && t.institution && (
                <Row label="Institution">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="text-muted size-4" /> {t.institution.name}
                  </span>
                  {t.institution.contact && (
                    <span className="text-muted block text-[12px]">
                      {t.institution.contact.name} · {t.institution.contact.email}
                    </span>
                  )}
                </Row>
              )}
              <Row label="Category">{CATEGORIES[t.category]}</Row>
              <Row label="Priority">
                {side === 'platform' && !closed ? (
                  <Select
                    aria-label="Priority"
                    className="h-9"
                    value={t.priority}
                    onChange={(e) => update.mutate({ priority: e.target.value })}
                  >
                    {Object.entries(PRIORITIES).map(([k, p]) => (
                      <option key={k} value={k}>
                        {p.label} ({p.hours} h)
                      </option>
                    ))}
                  </Select>
                ) : (
                  <PriorityBadge priority={t.priority} />
                )}
              </Row>
              <Row label="First response">
                <ResponseBadge t={t} now={q.dataUpdatedAt} />
                <span className="text-muted mt-1 block text-[12px]">
                  Target {formatDateTime(t.responseDueAt)}
                  {t.firstResponseAt && ` · answered ${formatDateTime(t.firstResponseAt)}`}
                </span>
              </Row>
              <Row label="Handled by">{t.assignedToName || <span className="text-muted">Not assigned yet</span>}</Row>
              <Row label="Last activity">{formatDateTime(t.lastActivityAt)}</Row>
              {t.resolvedAt && <Row label="Resolved">{formatDateTime(t.resolvedAt)}</Row>}
              {t.closedAt && <Row label="Closed">{formatDateTime(t.closedAt)}</Row>}
            </dl>
          </Card>
          <Card className="p-5 sm:p-6">
            {side === 'platform' ? (
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={!!t.assignedToName}
                  icon={<UserCheck className="size-4" />}
                  loading={update.isPending}
                  onClick={() => update.mutate({ assignToMe: true })}
                >
                  {t.assignedToName ? `Handled by ${t.assignedToName}` : 'Assign to me'}
                </Button>
                <Field label="Change status" htmlFor="tk-set-status">
                  <Select
                    id="tk-set-status"
                    value={t.status}
                    onChange={(e) => update.mutate({ status: e.target.value })}
                  >
                    {Object.entries(TICKET_STATUS).map(([k, s]) => (
                      <option key={k} value={k}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-body text-[13px]">
                  {t.status === 'RESOLVED'
                    ? 'The ADMITRA team marked this ticket as resolved. Close it if everything works, or reply to reopen it.'
                    : closed
                      ? 'This ticket is closed. Reply to reopen it if the problem comes back.'
                      : 'Close the ticket yourself when you no longer need help.'}
                </p>
                {!closed && (
                  <Button
                    variant={t.status === 'RESOLVED' ? 'success' : 'secondary'}
                    className="w-full"
                    icon={<CheckCircle2 className="size-4" />}
                    loading={update.isPending}
                    onClick={() => update.mutate({})}
                  >
                    Close ticket
                  </Button>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3">
      <dt className="text-muted text-[12px] font-semibold tracking-wide uppercase">{label}</dt>
      <dd className="text-ink min-w-0">{children}</dd>
    </div>
  );
}
