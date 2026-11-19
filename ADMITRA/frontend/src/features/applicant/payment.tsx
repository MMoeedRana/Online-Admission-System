'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Building2, Download, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FileDrop } from '@/components/ui/file-drop';
import { Field, Input, Select } from '@/components/ui/input';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/constants';
import { downloadFile } from '@/lib/files';
import { formatDate, formatMoney, toDateInput } from '@/lib/format';
import { useApplication } from './use-application';

const schema = z.object({
  method: z.enum(Object.keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS]),
  reference: z.string().trim().min(4, 'Enter the transaction or slip reference.').max(40),
  amount: z.coerce.number<string>().positive('Enter the amount you paid.'),
  paidOn: z.string().min(1, 'Enter the payment date.'),
});
type Values = z.input<typeof schema>;

/** FEE-1 to FEE-4: challan, proof of payment and receipts. */
export function PaymentPage({ id }: { id: string }) {
  const { data, refresh } = useApplication(id);
  const [file, setFile] = useState<File | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: { method: 'BANK_DEPOSIT', reference: '', amount: '', paidOn: toDateInput(new Date()) },
  });
  const submit = useMutation({
    mutationFn: async (v: Values) => {
      const fd = new FormData();
      Object.entries(v).forEach(([k, val]) => fd.append(k, String(val)));
      fd.append('file', file!);
      return api.post(`/me/applications/${id}/payments`, fd);
    },
    onSuccess: async () => {
      toast.success('Proof of payment submitted. The finance office will verify it.');
      form.reset();
      setFile(null);
      await refresh();
    },
    onError: (e) => {
      Object.entries(fieldErrors(e)).forEach(([k, m]) => form.setError(k as keyof Values, { message: m }));
      toast.error(errorMessage(e));
    },
  });
  if (!data) return <FullPageLoader />;
  // After an offer is accepted, the admission challan is shown and paid here (Table 3.14, step 4).
  const admission = data.vouchers.filter((v) => v.type === 'ADMISSION' && v.status !== 'CANCELLED').at(-1);
  const voucher = admission ?? data.vouchers.find((v) => v.type === 'APPLICATION');
  const isAdmission = voucher?.type === 'ADMISSION';
  const errors = form.formState.errors;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/applicant/applications/${id}`}
          className="text-muted hover:text-primary mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold"
        >
          <ArrowLeft className="size-3.5" /> Application {data.application.applicationNumber}
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">{isAdmission ? 'Admission fee' : 'Application fee'}</h1>
        <p className="text-muted mt-1 text-[13.5px]">{data.institution.name}</p>
      </div>

      {!voucher ? (
        <Alert tone="info">A challan is issued when the application is submitted.</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-6">
            <Card className="overflow-hidden">
              <div className="bg-navy flex flex-wrap items-center justify-between gap-3 px-6 py-5 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white/10">
                    <Building2 className="size-5" />
                  </span>
                  <div>
                    <p className="text-[12px] text-white/70">Fee challan</p>
                    <p className="text-[16px] font-bold">{voucher.voucherNumber}</p>
                  </div>
                </div>
                <StatusBadge status={voucher.status} />
              </div>
              <CardBody className="space-y-4 pt-5">
                <dl className="space-y-2 text-[13.5px]">
                  {voucher.items.map((i) => (
                    <div key={i.label} className="flex justify-between gap-3">
                      <dt className="text-muted">{i.label}</dt>
                      <dd className="text-ink font-semibold">{formatMoney(i.amount)}</dd>
                    </div>
                  ))}
                  <div className="border-line flex items-end justify-between border-t pt-3">
                    <dt className="text-ink font-semibold">Total payable</dt>
                    <dd className="text-ink text-[24px] font-extrabold">{formatMoney(voucher.amount)}</dd>
                  </div>
                </dl>
                <p className="text-muted text-[12.5px]">
                  Issued {formatDate(voucher.createdAt)} · due {formatDate(voucher.dueDate)}. Pay at any branch or by
                  transfer using the account printed on the challan.
                </p>
                <Button
                  variant="secondary"
                  icon={<Download className="size-4" />}
                  onClick={() =>
                    void downloadFile(
                      `/me/applications/${id}/challan.pdf${isAdmission ? '?type=ADMISSION' : ''}`,
                      `${voucher.voucherNumber}.pdf`,
                    )
                  }
                >
                  Download challan (PDF)
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Payments" subtitle="Your proofs and receipts" />
              <CardBody className="divide-line divide-y">
                {data.payments.length === 0 && <p className="text-muted text-[13px]">No payment submitted yet.</p>}
                {data.payments.map((p) => (
                  <div
                    key={p._id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-ink text-[13.5px] font-semibold">
                        {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? p.method} · {p.reference}
                      </p>
                      <p className="text-muted text-[12.5px]">
                        {formatMoney(p.amount)} paid on {formatDate(p.paidOn)}
                        {p.reason && <span className="text-red-600"> · {p.reason}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={p.status}
                        label={p.status === 'PENDING' ? 'Awaiting verification' : undefined}
                      />
                      {p.receiptNumber && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Receipt className="size-4" />}
                          onClick={() =>
                            void downloadFile(
                              `/me/applications/${id}/payments/${p._id}/receipt.pdf`,
                              `${p.receiptNumber}.pdf`,
                            )
                          }
                        >
                          Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <aside>
            {voucher.status === 'ISSUED' ? (
              <Card className="p-5">
                <h2 className="text-[15px] font-bold">Submit proof of payment</h2>
                <p className="text-muted mt-1 text-[12.5px]">
                  Upload the paid challan or the transfer screenshot. It is checked by the finance office.
                </p>
                <form
                  className="mt-4 space-y-4"
                  onSubmit={form.handleSubmit((v) =>
                    file ? submit.mutate(v) : toast.error('Attach the proof of payment.'),
                  )}
                  noValidate
                >
                  <Field label="Payment method" htmlFor="method" error={errors.method?.message} required>
                    <Select id="method" {...form.register('method')}>
                      {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Transaction / slip reference"
                    htmlFor="reference"
                    error={errors.reference?.message}
                    required
                  >
                    <Input id="reference" placeholder="e.g. TRX-883120" {...form.register('reference')} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount (Rs.)" htmlFor="amount" error={errors.amount?.message} required>
                      <Input
                        id="amount"
                        inputMode="numeric"
                        placeholder={String(voucher.amount)}
                        {...form.register('amount')}
                      />
                    </Field>
                    <Field label="Paid on" htmlFor="paidOn" error={errors.paidOn?.message} required>
                      <Input id="paidOn" type="date" max={toDateInput(new Date())} {...form.register('paidOn')} />
                    </Field>
                  </div>
                  <FileDrop
                    accept="application/pdf,image/jpeg,image/png"
                    hint="PDF, JPG or PNG up to 2 MB"
                    file={file}
                    onFile={setFile}
                  />
                  <Button type="submit" className="w-full" loading={submit.isPending}>
                    Submit proof
                  </Button>
                </form>
              </Card>
            ) : (
              <Alert
                tone={voucher.status === 'PAID' ? 'success' : 'info'}
                title={voucher.status === 'PAID' ? 'Fee paid' : 'Proof under verification'}
              >
                {voucher.status === 'PAID'
                  ? 'Your payment is verified. Download the receipt from the list.'
                  : 'The finance office will verify your payment. You will be notified.'}
              </Alert>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
