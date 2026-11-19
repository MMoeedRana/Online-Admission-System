'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CreditCard, Download, FileCheck2, GraduationCap, Hourglass, Stamp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Reveal } from '@/components/ui/motion';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { errorMessage, post } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Breakdown, useResults } from './my-results';

/** Figure 4.10: the offer, the admission fee and enrollment as a timeline. */
export function OfferPage({ applicationId }: { applicationId: string }) {
  const q = useResults();
  const qc = useQueryClient();
  const [decline, setDecline] = useState(false);
  const accept = useMutation({
    mutationFn: (id: string) => post(`/me/offers/${id}/accept`),
    onSuccess: async () => {
      toast.success('Offer accepted. Your admission challan is ready.');
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!q.data) return <FullPageLoader />;
  const r = q.data.data.find((x) => x.application._id === applicationId);
  if (!r?.offer) return <Alert tone="info">There is no admission offer for this application.</Alert>;
  const o = r.offer;
  const v = r.voucher;
  const enrolled = r.enrollment?.status === 'ENROLLED';
  const steps = [
    {
      icon: Stamp,
      title: 'Offer issued',
      text: `Merit position ${o.meritPosition}, aggregate ${o.aggregate.toFixed(2)}`,
      done: true,
    },
    {
      icon: Check,
      title: 'Accept the offer',
      text: `Before ${formatDateTime(o.deadline)}`,
      done: o.status !== 'OFFERED' && o.status !== 'DECLINED' && o.status !== 'EXPIRED',
    },
    {
      icon: CreditCard,
      title: 'Pay the admission fee',
      text: v ? `${formatMoney(v.amount)} · challan ${v.voucherNumber}` : formatMoney(o.admissionFee),
      done: Boolean(v && ['AWAITING_VERIFICATION', 'PAID'].includes(v.status)),
    },
    {
      icon: Hourglass,
      title: 'Fee verified by the finance office',
      text: r.payment?.receiptNumber ? `Receipt ${r.payment.receiptNumber}` : 'Usually within two working days',
      done: v?.status === 'PAID',
    },
    {
      icon: GraduationCap,
      title: 'Registration number and admission letter',
      text: enrolled
        ? r.enrollment!.registrationNumber!
        : r.enrollment?.status === 'PENDING_ORIGINALS'
          ? 'After the originals check on the reporting day'
          : 'Issued after verification',
      done: enrolled,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/applicant/results"
        className="text-muted hover:text-primary inline-flex items-center gap-1 text-[12.5px] font-semibold"
      >
        <ArrowLeft className="size-3.5" /> My results
      </Link>
      <Reveal>
        <section className="hero-gradient overflow-hidden rounded-[24px] p-6 text-white sm:p-8">
          <p className="text-[13px] font-semibold text-blue-100">Admission offer · {r.institution.name}</p>
          <h1 className="mt-2 text-[26px] font-extrabold text-white">{o.program}</h1>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Shift', o.shift.toLowerCase()],
              ['Merit position', `#${o.meritPosition}`],
              ['Admission fee', formatMoney(o.admissionFee)],
              ['Deadline', formatDate(o.deadline)],
            ].map(([k, val]) => (
              <div key={k} className="rounded-2xl bg-white/[0.08] p-3 ring-1 ring-white/10">
                <p className="text-[11.5px] text-blue-100/80">{k}</p>
                <p className="text-[16px] font-bold capitalize">{val}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>
      {o.status === 'DECLINED' && <Alert tone="info">You declined this offer.</Alert>}
      {o.status === 'EXPIRED' && (
        <Alert tone="error">This offer expired because it was not accepted and paid by the deadline.</Alert>
      )}
      {o.status === 'REVOKED' && (
        <Alert tone="error" title="Admission revoked">
          {o.reason}
        </Alert>
      )}
      <Card className="p-6">
        <h2 className="text-[16px] font-bold">Next steps</h2>
        <ol className="mt-5 space-y-0">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    'absolute top-10 left-5 h-[calc(100%-2.5rem)] w-0.5',
                    s.done ? 'bg-green-500' : 'bg-line',
                  )}
                />
              )}
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full',
                  s.done
                    ? 'bg-green-500 text-white'
                    : i === current
                      ? 'bg-primary ring-primary/20 text-white ring-4'
                      : 'bg-card-soft text-muted',
                )}
              >
                <s.icon className="size-[18px]" />
              </span>
              <div className="pt-1.5">
                <p className={cn('text-[14.5px] font-semibold', s.done || i === current ? 'text-ink' : 'text-muted')}>
                  {s.title}
                </p>
                <p className="text-muted text-[13px]">{s.text}</p>
                {i === current && i === 1 && o.status === 'OFFERED' && (
                  <div className="mt-3 flex gap-2">
                    <Button loading={accept.isPending} onClick={() => accept.mutate(o._id)}>
                      Accept offer
                    </Button>
                    <Button variant="secondary" onClick={() => setDecline(true)}>
                      Decline
                    </Button>
                  </div>
                )}
                {i === current && i === 2 && v?.status === 'ISSUED' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ButtonLink
                      href={`/applicant/applications/${applicationId}/payment`}
                      icon={<CreditCard className="size-4" />}
                    >
                      Pay and upload proof
                    </ButtonLink>
                    <Button
                      variant="secondary"
                      icon={<Download className="size-4" />}
                      onClick={() =>
                        void downloadFile(
                          `/me/applications/${applicationId}/challan.pdf?type=ADMISSION`,
                          `${v.voucherNumber}.pdf`,
                        )
                      }
                    >
                      Challan PDF
                    </Button>
                  </div>
                )}
                {s.done && i === 4 && (
                  <Button
                    className="mt-3"
                    icon={<FileCheck2 className="size-4" />}
                    onClick={() =>
                      void downloadFile(
                        `/me/enrollments/${r.enrollment!._id}/letter.pdf`,
                        `${r.enrollment!.registrationNumber}.pdf`,
                      )
                    }
                  >
                    Download admission letter
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>
      {r.latest?.entry && (
        <Card className="p-6">
          <h2 className="text-[16px] font-bold">Your aggregate</h2>
          <Breakdown lines={r.latest.entry.breakdown} aggregate={r.latest.entry.aggregate} />
        </Card>
      )}
      <ConfirmDialog
        open={decline}
        onClose={() => setDecline(false)}
        title="Decline offer"
        message="Your seat will be offered to the next applicant. This cannot be undone."
        confirmLabel="Decline offer"
        onConfirm={async () => {
          try {
            await post(`/me/offers/${o._id}/decline`);
            setDecline(false);
            toast.success('Offer declined.');
            await qc.invalidateQueries({ queryKey: ['me'] });
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
