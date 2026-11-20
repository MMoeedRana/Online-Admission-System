'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, CreditCard, Download, Receipt, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FilePreview } from '@/components/ui/file-preview';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useInstKey } from '@/features/institution/hooks';
import { errorMessage, getPaged, post } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/constants';
import { downloadFile } from '@/lib/files';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { PageMeta } from '@/lib/types';
import { NoteDialog } from './note-dialog';

interface Row {
  _id: string;
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  voucherNumber: string;
  challanAmount: number;
  method: keyof typeof PAYMENT_METHODS;
  reference: string;
  amount: number;
  paidOn: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  receiptNumber: string | null;
  reason: string;
  proofFileId: string;
  decidedByName?: string;
  decidedAt?: string;
  createdAt: string;
  checks: { amountMatches: boolean; uniqueReference: boolean };
}
type TabKey = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL';

export function PaymentsPage() {
  const key = useInstKey();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Row | null>(null);
  const [reject, setReject] = useState(false);
  const status = tab === 'ALL' ? undefined : tab;
  const list = useQuery({
    queryKey: key('payments', tab, q, page),
    queryFn: () => getPaged<Row>('/payments', { status, q: q || undefined, page }),
  });
  const pending = (list.data?.meta as (PageMeta & { pending?: number }) | undefined)?.pending ?? 0;
  const decide = useMutation({
    mutationFn: (v: { decision: 'VERIFIED' | 'REJECTED'; reason: string }) =>
      post<Row>(`/payments/${open!._id}/decision`, v),
    onSuccess: async (_d, v) => {
      toast.success(
        v.decision === 'VERIFIED'
          ? 'Payment verified and receipt issued.'
          : 'Payment rejected. The applicant is notified.',
      );
      setReject(false);
      setOpen(null);
      await qc.invalidateQueries({ queryKey: key() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Verify proofs of payment against the bank statement"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={() =>
              void downloadFile(`/payments/export.csv${status ? `?status=${status}` : ''}`, 'payments.csv')
            }
          >
            Export CSV
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[1fr_280px] lg:items-center">
          <Tabs
            value={tab}
            onChange={(v) => (setTab(v), setPage(1))}
            tabs={[
              { value: 'PENDING', label: 'Awaiting verification', count: pending },
              { value: 'VERIFIED', label: 'Verified' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <Input
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
            placeholder="Search reference"
            aria-label="Search by reference"
          />
        </div>
        <DataTable
          loading={list.isLoading}
          rows={list.data?.data ?? []}
          rowKey={(r) => r._id}
          onRowClick={setOpen}
          empty={
            <EmptyState
              icon={CreditCard}
              title="No payments"
              text="Proofs of payment submitted by applicants appear here."
            />
          }
          columns={[
            {
              key: 'app',
              header: 'Applicant',
              primary: true,
              cell: (r) => (
                <div>
                  <p className="text-ink font-semibold">{r.applicantName}</p>
                  <p className="text-muted text-[12px]">{r.applicationNumber}</p>
                </div>
              ),
            },
            {
              key: 'ref',
              header: 'Reference',
              cell: (r) => <span className="font-mono text-[12.5px]">{r.reference}</span>,
            },
            { key: 'method', header: 'Method', cell: (r) => PAYMENT_METHODS[r.method] ?? r.method, hideOnMobile: true },
            {
              key: 'amount',
              header: 'Amount',
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  {formatMoney(r.amount)}
                  {!r.checks.amountMatches && (
                    <XCircle className="size-4 text-red-700 dark:text-red-400" aria-label="Amount differs" />
                  )}
                </span>
              ),
            },
            { key: 'paid', header: 'Paid on', cell: (r) => formatDate(r.paidOn) },
            {
              key: 'status',
              header: 'Status',
              cell: (r) => (
                <StatusBadge status={r.status} label={r.status === 'PENDING' ? 'Awaiting verification' : undefined} />
              ),
            },
            {
              key: 'go',
              header: '',
              className: 'text-right',
              cell: (r) => (
                <Button size="sm" variant="secondary" onClick={(e) => (e.stopPropagation(), setOpen(r))}>
                  {r.status === 'PENDING' ? 'Verify' : 'View'}
                </Button>
              ),
            },
          ]}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} className="p-4" />
      </Card>

      <Modal
        open={Boolean(open) && !reject}
        onClose={() => setOpen(null)}
        size="xl"
        title={open ? `Payment ${open.reference}` : ''}
        description={open ? `${open.applicantName} · ${open.applicationNumber}` : undefined}
        footer={
          open?.status === 'PENDING' ? (
            <>
              <Button
                variant="secondary"
                icon={<X className="size-4 text-red-700 dark:text-red-400" />}
                onClick={() => setReject(true)}
              >
                Reject
              </Button>
              <Button
                icon={<Check className="size-4" />}
                loading={decide.isPending}
                onClick={() => decide.mutate({ decision: 'VERIFIED', reason: '' })}
              >
                Verify payment
              </Button>
            </>
          ) : open?.receiptNumber ? (
            <Button
              variant="secondary"
              icon={<Receipt className="size-4" />}
              onClick={() => void downloadFile(`/payments/${open._id}/receipt.pdf`, `${open.receiptNumber}.pdf`)}
            >
              Download receipt
            </Button>
          ) : undefined
        }
      >
        {open && (
          <div className="grid gap-5 md:grid-cols-[1fr_260px]">
            <FilePreview fileId={open.proofFileId} className="h-[420px] w-full" />
            <div className="space-y-4 text-[13.5px]">
              <dl className="space-y-2">
                {[
                  ['Challan', open.voucherNumber],
                  ['Challan amount', formatMoney(open.challanAmount)],
                  ['Paid amount', formatMoney(open.amount)],
                  ['Method', PAYMENT_METHODS[open.method] ?? open.method],
                  ['Paid on', formatDate(open.paidOn)],
                  ['Submitted', formatDateTime(open.createdAt)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-ink text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="bg-card-soft space-y-1.5 rounded-xl p-3">
                <Check2 ok={open.checks.amountMatches} text="Amount equals the challan" />
                <Check2 ok={open.checks.uniqueReference} text="Reference not used before" />
              </div>
              {open.status !== 'PENDING' && (
                <div className="space-y-1">
                  <StatusBadge status={open.status} />
                  <p className="text-muted text-[12.5px]">
                    by {open.decidedByName} · {formatDateTime(open.decidedAt)}
                  </p>
                  {open.receiptNumber && <p className="font-semibold">Receipt {open.receiptNumber}</p>}
                  {open.reason && <p className="text-red-700 dark:text-red-400">{open.reason}</p>}
                </div>
              )}
              <p className="text-muted text-[12px]">
                Match the reference and amount with the bank statement before verifying. A decision cannot be changed.
              </p>
            </div>
          </div>
        )}
      </Modal>
      <NoteDialog
        open={reject}
        onClose={() => setReject(false)}
        title="Reject payment"
        message="The challan is reopened and the applicant can submit a new proof."
        confirmLabel="Reject payment"
        noteLabel="Reason (shown to the applicant)"
        required
        variant="danger"
        loading={decide.isPending}
        onSubmit={(reason) => decide.mutate({ decision: 'REJECTED', reason })}
      />
    </>
  );
}

function Check2({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <CheckCircle2 className="size-4 text-green-700 dark:text-green-400" />
      ) : (
        <XCircle className="size-4 text-red-700 dark:text-red-400" />
      )}{' '}
      {text}
    </p>
  );
}
