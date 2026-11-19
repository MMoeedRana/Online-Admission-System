'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CircleDot, CreditCard, Download, RotateCcw, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProgressRing, toneForStatus } from '@/components/ui/progress-ring';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { errorMessage, post } from '@/lib/api';
import { SHIFTS } from '@/lib/constants';
import { downloadFile } from '@/lib/files';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApplication } from './use-application';
import { DocumentUpload, Wizard } from './wizard';

/** Draft -> wizard; submitted -> status, timeline, deficiencies and fee (APP-4, APP-6, FLOW-5). */
export function ApplicationView({ id }: { id: string }) {
  const { data, refresh, error } = useApplication(id);
  const [withdraw, setWithdraw] = useState(false);
  const resubmit = useMutation({
    mutationFn: () => post(`/me/applications/${id}/resubmit`),
    onSuccess: async () => {
      toast.success('Corrections sent for review.');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!data) return <FullPageLoader />;
  if (data.application.status === 'DRAFT') return <Wizard data={data} refresh={refresh} />;

  const a = data.application;
  const voucher = data.vouchers.find((v) => v.type === 'APPLICATION');
  const rejectedDocs = data.documents.filter((d) => d.current && d.status === 'REJECTED');
  const prefs = a.preferences.slice().sort((x, y) => x.order - y.order);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/applicant/applications"
          className="text-muted hover:text-primary mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold"
        >
          <ArrowLeft className="size-3.5" /> My applications
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ProgressRing value={data.progress} tone={toneForStatus(a.status)} size={64} />
            <div>
              <h1 className="text-[21px] font-bold tracking-tight">{data.institution.name}</h1>
              <p className="text-muted text-[13px]">
                {a.applicationNumber} · {data.campaign.title} · submitted {formatDate(a.submittedAt)}
              </p>
              <div className="mt-1.5">
                <StatusBadge status={a.status} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() => void downloadFile(`/me/applications/${id}/form.pdf`, `${a.applicationNumber}.pdf`)}
            >
              Application form
            </Button>
            {voucher && (
              <ButtonLink
                href={`/applicant/applications/${id}/payment`}
                variant={voucher.status === 'ISSUED' ? 'primary' : 'secondary'}
                icon={<CreditCard className="size-4" />}
              >
                {voucher.status === 'ISSUED' ? 'Pay fee' : 'Fee & receipts'}
              </ButtonLink>
            )}
            {data.canWithdraw && (
              <Button
                variant="ghost"
                icon={<Undo2 className="size-4 text-red-600" />}
                onClick={() => setWithdraw(true)}
              >
                Withdraw
              </Button>
            )}
          </div>
        </div>
      </div>

      {a.status === 'PAYMENT_PENDING' && voucher?.status === 'ISSUED' && (
        <Alert tone="warning" title="Pay the application fee">
          Your application will be reviewed after the fee of {formatMoney(voucher.amount)} is paid and verified. Due
          date: {formatDate(voucher.dueDate)}.
        </Alert>
      )}
      {a.status === 'DEFICIENT' && (
        <Alert tone="error" title="Corrections needed">
          <p>{a.deficiency?.message || 'The admission office found problems in your application.'}</p>
          <p className="mt-1">Replace the rejected documents below (or correct your marks), then press Resubmit.</p>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {a.status === 'DEFICIENT' && (
            <div className="space-y-4">
              {data.documentTypes
                .filter((t) => rejectedDocs.some((d) => d.documentTypeId === t._id))
                .map((t) => (
                  <DocumentUpload key={t._id} appId={id} type={t} data={data} refresh={refresh} replaceOnly />
                ))}
              <div className="flex justify-end">
                <Button
                  icon={<RotateCcw className="size-4" />}
                  disabled={rejectedDocs.length > 0}
                  loading={resubmit.isPending}
                  onClick={() => resubmit.mutate()}
                >
                  Resubmit corrections
                </Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader title="Programs" subtitle="In order of preference" />
            <CardBody className="space-y-3">
              {prefs.map((p) => {
                const prog = data.programs.find((x) => x._id === p.programId);
                return (
                  <div key={p.programId} className="border-line flex items-center gap-3 rounded-xl border px-4 py-3">
                    <span className="bg-primary-soft text-primary flex size-8 items-center justify-center rounded-full text-[13px] font-bold">
                      {p.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate font-semibold">{prog?.title ?? 'Program'}</p>
                      <p className="text-muted text-[12.5px]">{SHIFTS[p.shift as keyof typeof SHIFTS]} shift</p>
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" />
            <CardBody className="divide-line divide-y">
              {data.documentTypes.map((t) => {
                const d = data.documents.find((x) => x.current && x.documentTypeId === t._id);
                const last = d?.reviewTrail.at(-1);
                return (
                  <div
                    key={t._id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-ink text-[13.5px] font-semibold">{t.name}</p>
                      {last?.reason && <p className="text-[12.5px] text-red-600">{last.reason}</p>}
                    </div>
                    {d ? (
                      <StatusBadge status={d.status} />
                    ) : (
                      <span className="text-muted text-[12.5px]">Not uploaded</span>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="space-y-4">
                {a.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li key={i} className="flex gap-3">
                      {i === 0 ? (
                        <CircleDot className="text-primary mt-0.5 size-4 shrink-0" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      )}
                      <div className="min-w-0">
                        <p className={cn('text-[13.5px] font-semibold', i === 0 ? 'text-ink' : 'text-body')}>
                          <StatusLabel status={h.to} />
                        </p>
                        <p className="text-muted text-[12px]">{formatDateTime(h.at)}</p>
                        {h.note && <p className="text-body mt-0.5 text-[12.5px]">{h.note}</p>}
                      </div>
                    </li>
                  ))}
              </ol>
            </CardBody>
          </Card>
          {voucher && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-bold">Application fee</h2>
                <StatusBadge status={voucher.status} />
              </div>
              <p className="mt-3 text-[24px] font-extrabold">{formatMoney(voucher.amount)}</p>
              <p className="text-muted text-[12.5px]">
                Challan {voucher.voucherNumber} · due {formatDate(voucher.dueDate)}
              </p>
            </Card>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={withdraw}
        onClose={() => setWithdraw(false)}
        title="Withdraw application"
        message="Your application will be withdrawn and any unpaid challan cancelled. This cannot be undone."
        confirmLabel="Withdraw"
        onConfirm={async () => {
          try {
            await post(`/me/applications/${id}/withdraw`);
            setWithdraw(false);
            toast.success('Application withdrawn.');
            await refresh();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

const LABELS: Record<string, string> = {
  DRAFT: 'Draft created',
  SUBMITTED: 'Submitted',
  PAYMENT_PENDING: 'Waiting for fee payment',
  UNDER_REVIEW: 'Under review',
  DOCUMENT_VERIFICATION: 'Document verification',
  DEFICIENT: 'Corrections requested',
  ELIGIBILITY_CHECK: 'Eligibility check',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};
function StatusLabel({ status }: { status: string }) {
  return <>{LABELS[status] ?? status}</>;
}
