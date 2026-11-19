'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  MessageSquare,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge, RecordBadge, StatusBadge, TrustChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FilePreview } from '@/components/ui/file-preview';
import { Textarea } from '@/components/ui/input';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { LEVEL_LABELS } from '@/features/applicant/types';
import { useAuth } from '@/features/auth/auth-context';
import { useInstKey } from '@/features/institution/hooks';
import { errorMessage, get, post } from '@/lib/api';
import { SHIFTS } from '@/lib/constants';
import { downloadFile } from '@/lib/files';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { NoteDialog } from './note-dialog';
import type { StaffAppDetail } from './types';

const DANGER = ['REJECTED', 'DEFICIENT'];

/** APP-6, DOC-4, FLOW-2 to FLOW-4: review of one application. */
export function ApplicationReview({ id }: { id: string }) {
  const key = useInstKey();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: key('application', id), queryFn: () => get<StaffAppDetail>(`/applications/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: key() });
  const [action, setAction] = useState<StaffAppDetail['actions'][number] | null>(null);
  const [rejectDoc, setRejectDoc] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const transition = useMutation({
    mutationFn: (v: { to: string; note: string }) => post(`/applications/${id}/transition`, v),
    onSuccess: async () => {
      toast.success('Application updated.');
      setAction(null);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const review = useMutation({
    mutationFn: (v: { docId: string; decision: 'APPROVED' | 'REJECTED'; reason: string }) =>
      post(`/applications/${id}/documents/${v.docId}/review`, { decision: v.decision, reason: v.reason }),
    onSuccess: async (_d, v) => {
      toast.success(v.decision === 'APPROVED' ? 'Document approved.' : 'Document rejected.');
      setRejectDoc(null);
      // Move on to the next document that still needs a decision.
      const docs = q.data?.documents.filter((x) => x.current) ?? [];
      const next = docs.find((x) => x._id !== v.docId && x.status === 'UPLOADED');
      if (next) setSelectedDoc(next._id);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addNote = useMutation({
    mutationFn: () => post(`/applications/${id}/notes`, { text: note }),
    onSuccess: async () => {
      setNote('');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <FullPageLoader />;
  const d = q.data;
  const a = d.application;
  const p = d.applicant.profile;
  const currentDocs = d.documents.filter((x) => x.current);
  const shownDoc = currentDocs.find((x) => x._id === selectedDoc) ?? currentDocs[0];
  const voucher = d.vouchers.find((v) => v.type === 'APPLICATION');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/institution/applications"
          className="text-muted hover:text-primary mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold"
        >
          <ArrowLeft className="size-3.5" /> Applications
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight">{p?.fullName ?? 'Applicant'}</h1>
              <StatusBadge status={a.status} />
            </div>
            <p className="text-muted mt-1 text-[13px]">
              {a.applicationNumber} · {d.campaign.title} · submitted {formatDate(a.submittedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() => void downloadFile(`/applications/${id}/form.pdf`, `${a.applicationNumber}.pdf`)}
            >
              Form PDF
            </Button>
            {d.actions.map((x) => (
              <Button
                key={x.to}
                variant={DANGER.includes(x.to) ? (x.to === 'REJECTED' ? 'danger' : 'secondary') : 'primary'}
                onClick={() => setAction(x)}
              >
                {x.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {d.flags.length > 0 && (
        <Alert tone="error" title="Fraud flags on this applicant">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {d.flags.map((f) => (
              <li key={f._id}>{f.details}</li>
            ))}
          </ul>
        </Alert>
      )}
      {a.status === 'DEFICIENT' && a.deficiency && (
        <Alert tone="warning" title="Waiting for the applicant's corrections">
          {a.deficiency.message}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Applicant" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['CNIC', p?.cnicFormatted ?? p?.cnic],
                  ['Father name', p?.fatherName],
                  ['Date of birth', formatDate(p?.dateOfBirth)],
                  ['Gender', p?.gender ? p.gender[0] + p.gender.slice(1).toLowerCase() : ''],
                  ['Phone', p?.phone],
                  ['E-mail', d.applicant.email],
                  ['Domicile', p?.domicile],
                  ['City', p?.permanentAddress?.city],
                  ['Guardian', p?.guardian ? `${p.guardian.name} (${p.guardian.relation})` : ''],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted text-[12px]">{k}</dt>
                    <dd className="text-ink truncate font-semibold">{v || '-'}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Preferences and eligibility" />
            <CardBody className="space-y-3">
              {d.preferences
                .slice()
                .sort((x, y) => x.order - y.order)
                .map((pr) => (
                  <div key={pr.programId} className="border-line rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-ink font-semibold">
                        {pr.order}. {pr.program?.title}{' '}
                        <span className="text-muted font-normal">· {SHIFTS[pr.shift as keyof typeof SHIFTS]}</span>
                      </p>
                      {pr.eligibility?.eligible ? (
                        <Badge tone="green">Eligible</Badge>
                      ) : (
                        <Badge tone="red">Not eligible</Badge>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {pr.eligibility?.checks.map((c) => (
                        <li key={c.level} className="flex items-start gap-2 text-[13px]">
                          {c.ok ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                          ) : (
                            <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                          )}
                          {c.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Academic record"
              subtitle="Trust level 0 self-declared · 1 document · 2 registry · 3 officer verified"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                    <th className="px-5 py-3 font-semibold">Qualification</th>
                    <th className="px-3 py-3 font-semibold">Board / roll no.</th>
                    <th className="px-3 py-3 font-semibold">Marks</th>
                    <th className="px-3 py-3 font-semibold">Trust</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.records.map((r) => (
                    <tr key={r._id} className="border-line border-b last:border-0">
                      <td className="text-ink px-5 py-3 font-semibold">{LEVEL_LABELS[r.level]}</td>
                      <td className="px-3 py-3">
                        {r.board} · {r.rollNo} ({r.year})
                      </td>
                      <td className="px-3 py-3">
                        {r.obtained}/{r.total} <span className="text-muted">({r.percentage}%)</span>
                      </td>
                      <td className="px-3 py-3">
                        <TrustChip level={r.trustLevel} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <RecordBadge status={r.verificationStatus} />
                          {can('marks.verify') && !r.locked && (
                            <Link
                              href={`/institution/verifications/${r._id}`}
                              className="text-primary"
                              aria-label="Open verification"
                            >
                              <ExternalLink className="size-4" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Documents"
              subtitle={
                d.canReviewDocuments
                  ? 'Approve each document or reject it with a reason (DOC-4).'
                  : 'Documents can be reviewed during document verification.'
              }
            />
            <CardBody>
              {currentDocs.length === 0 ? (
                <p className="text-muted text-[13px]">No documents uploaded.</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <ul className="space-y-2">
                    {currentDocs.map((doc) => {
                      const t = d.documentTypes.find((x) => x._id === doc.documentTypeId);
                      return (
                        <li key={doc._id}>
                          <button
                            aria-label={`Document ${t?.name ?? ''}`}
                            aria-current={shownDoc?._id === doc._id}
                            onClick={() => setSelectedDoc(doc._id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px]',
                              shownDoc?._id === doc._id
                                ? 'border-primary bg-primary-soft'
                                : 'border-line hover:bg-card-soft',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="text-ink block truncate font-semibold">{t?.name ?? 'Document'}</span>
                              <span className="text-muted text-[11.5px]">version {doc.version}</span>
                            </span>
                            <StatusBadge status={doc.status} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {shownDoc && (
                    <div className="min-w-0 space-y-3">
                      <FilePreview fileId={shownDoc.fileId._id} className="h-[420px] w-full" />
                      {shownDoc.reviewTrail.length > 0 && (
                        <ul className="text-muted space-y-1 text-[12.5px]">
                          {shownDoc.reviewTrail.map((t, i) => (
                            <li key={i}>
                              {t.decision === 'APPROVED' ? 'Approved' : 'Rejected'} by {t.reviewerName} on{' '}
                              {formatDateTime(t.at)}
                              {t.reason && `: ${t.reason}`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {d.canReviewDocuments && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            icon={<Check className="size-4" />}
                            disabled={shownDoc.status === 'APPROVED'}
                            loading={review.isPending && review.variables?.decision === 'APPROVED'}
                            onClick={() => review.mutate({ docId: shownDoc._id, decision: 'APPROVED', reason: '' })}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            icon={<X className="size-4 text-red-600" />}
                            disabled={shownDoc.status === 'REJECTED'}
                            onClick={() => setRejectDoc(shownDoc._id)}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Application fee</h2>
              {voucher && <StatusBadge status={voucher.status} />}
            </div>
            {voucher ? (
              <>
                <p className="mt-3 text-[22px] font-extrabold">{formatMoney(voucher.amount)}</p>
                <p className="text-muted text-[12.5px]">Challan {voucher.voucherNumber}</p>
                {d.payments.map((pay) => (
                  <div
                    key={pay._id}
                    className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3 text-[12.5px]"
                  >
                    <span>
                      {pay.reference} · {formatDate(pay.paidOn)}
                    </span>
                    <StatusBadge
                      status={pay.status}
                      label={pay.status === 'PENDING' ? 'Awaiting verification' : undefined}
                    />
                  </div>
                ))}
                {can('payments.verify') && d.payments.some((x) => x.status === 'PENDING') && (
                  <Link
                    href="/institution/payments"
                    className="text-primary mt-3 inline-block text-[13px] font-semibold"
                  >
                    Verify in Payments
                  </Link>
                )}
              </>
            ) : (
              <p className="text-muted mt-2 text-[13px]">No challan.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Internal notes" subtitle="Visible to staff only" />
            <CardBody className="space-y-3">
              {a.notes.map((n, i) => (
                <div key={i} className="bg-card-soft rounded-xl p-3 text-[13px]">
                  <p className="text-ink">{n.text}</p>
                  <p className="text-muted mt-1 text-[11.5px]">
                    {n.byName} · {formatDateTime(n.at)}
                  </p>
                </div>
              ))}
              {can('applications.review') && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note for other staff"
                    aria-label="Internal note"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<MessageSquare className="size-4" />}
                    disabled={note.trim().length < 2}
                    loading={addNote.isPending}
                    onClick={() => addNote.mutate()}
                  >
                    Add note
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="space-y-3">
                {a.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li key={i} className="text-[13px]">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={h.to} />
                        <span className="text-muted text-[11.5px]">{formatDateTime(h.at)}</span>
                      </div>
                      <p className="text-muted mt-1 text-[12.5px]">
                        by {h.byName || h.actor.toLowerCase()}
                        {h.note && <span className="text-body"> · {h.note}</span>}
                      </p>
                    </li>
                  ))}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>

      <NoteDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action?.label ?? ''}
        message={
          action?.to === 'DEFICIENT'
            ? 'The applicant will be asked to correct the rejected documents or marks and resubmit.'
            : undefined
        }
        confirmLabel={action?.label ?? 'Confirm'}
        noteLabel={action?.noteRequired ? 'Reason (shown to the applicant)' : 'Note'}
        required={action?.noteRequired}
        variant={action?.to === 'REJECTED' ? 'danger' : 'primary'}
        loading={transition.isPending}
        onSubmit={(n) => action && transition.mutate({ to: action.to, note: n })}
      />
      <NoteDialog
        open={Boolean(rejectDoc)}
        onClose={() => setRejectDoc(null)}
        title="Reject document"
        confirmLabel="Reject document"
        noteLabel="Reason for rejection"
        required
        variant="danger"
        loading={review.isPending}
        onSubmit={(reason) => rejectDoc && review.mutate({ docId: rejectDoc, decision: 'REJECTED', reason })}
      />
      {a.status === 'DOCUMENT_VERIFICATION' && currentDocs.some((x) => x.status === 'REJECTED') && (
        <p className="flex items-center gap-2 text-[12.5px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4" /> Some documents are rejected. Use “Send deficiency notice” to ask the
          applicant for corrections.
        </p>
      )}
    </div>
  );
}
