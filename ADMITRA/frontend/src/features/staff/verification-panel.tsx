'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock, ShieldCheck, ShieldX, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge, RecordBadge, TrustChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FilePreview } from '@/components/ui/file-preview';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { LEVEL_LABELS, type AcademicRecord } from '@/features/applicant/types';
import { useInstKey } from '@/features/institution/hooks';
import { errorMessage, get, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NoteDialog } from './note-dialog';
import type { FraudFlag } from './types';

interface Official {
  studentName: string;
  fatherName: string;
  obtained: number;
  total: number;
  subjects: { name: string; obtained: number; total: number }[];
  source?: string;
}
interface Detail {
  record: AcademicRecord;
  official: Official | null;
  history: {
    _id: string;
    method: string;
    status: string;
    note?: string;
    createdAt: string;
    decidedBy?: { fullName: string };
  }[];
  flags: FraudFlag[];
  profile: { fullName: string; fatherName: string; cnic: string } | null;
  integrity: { errors: Record<string, string>; flags: string[] };
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');

/** MARK-7: entered marks vs the registry and the result card, side by side. */
export function VerificationPanel({ id }: { id: string }) {
  const key = useInstKey();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key('verification', id), queryFn: () => get<Detail>(`/verifications/${id}`) });
  const [decision, setDecision] = useState<'VERIFIED' | 'MISMATCH' | null>(null);
  const decide = useMutation({
    mutationFn: (v: { decision: 'VERIFIED' | 'MISMATCH'; note: string }) => post(`/verifications/${id}/decision`, v),
    onSuccess: async (_d, v) => {
      toast.success(
        v.decision === 'VERIFIED' ? 'Marks verified and locked.' : 'Mismatch recorded. The applicant is notified.',
      );
      setDecision(null);
      await qc.invalidateQueries({ queryKey: key() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resolve = useMutation({
    mutationFn: (flagId: string) => post(`/verifications/flags/${flagId}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key() }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <FullPageLoader />;
  const { record: r, official: o, history, flags, profile, integrity } = q.data;

  const rows: { label: string; entered: string | number; official: string | number | null; ok: boolean }[] = [
    {
      label: 'Student name',
      entered: r.studentName,
      official: o?.studentName ?? null,
      ok: !r.registryDiff.some((x) => x.field === 'studentName'),
    },
    {
      label: 'Father name',
      entered: r.fatherName,
      official: o?.fatherName ?? null,
      ok: !r.registryDiff.some((x) => x.field === 'fatherName'),
    },
    ...r.subjects.map((s) => {
      const os = o?.subjects.find((x) => norm(x.name) === norm(s.name));
      return {
        label: s.name,
        entered: `${s.obtained}/${s.total}`,
        official: os ? `${os.obtained}/${os.total}` : null,
        ok: !os || (os.obtained === s.obtained && os.total === s.total),
      };
    }),
    {
      label: 'Total',
      entered: `${r.obtained}/${r.total}`,
      official: o ? `${o.obtained}/${o.total}` : null,
      ok: !o || (o.obtained === r.obtained && o.total === r.total),
    },
  ];
  const integrityErrors = Object.values(integrity.errors);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/institution/verifications"
          className="text-muted hover:text-primary mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold"
        >
          <ArrowLeft className="size-3.5" /> Marks Verification
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight">{profile?.fullName ?? r.studentName}</h1>
              <RecordBadge status={r.verificationStatus} />
              <TrustChip level={r.trustLevel} />
            </div>
            <p className="text-muted mt-1 text-[13px]">
              {LEVEL_LABELS[r.level]} · {r.board} · roll no. {r.rollNo} · {r.year} · version {r.version}
            </p>
          </div>
          {r.locked ? (
            <Badge tone="green">
              <Lock className="size-3.5" /> Verified and locked
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<ShieldX className="size-4 text-red-700 dark:text-red-400" />}
                onClick={() => setDecision('MISMATCH')}
              >
                Flag mismatch
              </Button>
              <Button icon={<ShieldCheck className="size-4" />} onClick={() => setDecision('VERIFIED')}>
                Confirm verified
              </Button>
            </div>
          )}
        </div>
      </div>

      {flags.length > 0 && (
        <Alert tone="error" title="Fraud flags (MARK-9)">
          <ul className="mt-1 space-y-1">
            {flags.map((f) => (
              <li key={f._id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{f.details}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={resolve.isPending && resolve.variables === f._id}
                  onClick={() => resolve.mutate(f._id)}
                >
                  Mark resolved
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Entered vs registry"
            subtitle={
              o ? `Official record${o.source ? ` (${o.source})` : ''}` : 'No registry record found for this roll number'
            }
          />
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="w-full min-w-[480px] text-left text-[13.5px]">
              <thead>
                <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                  <th className="px-5 py-3 font-semibold">Field</th>
                  <th className="px-3 py-3 font-semibold">Entered</th>
                  <th className="px-3 py-3 font-semibold">Registry</th>
                  <th className="px-5 py-3 font-semibold">Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr
                    key={x.label}
                    className={cn('border-line border-b last:border-0', !x.ok && 'bg-red-50/60 dark:bg-red-500/5')}
                  >
                    <td className="text-ink px-5 py-3 font-medium">{x.label}</td>
                    <td className="px-3 py-3">{x.entered}</td>
                    <td className="px-3 py-3">{x.official ?? <span className="text-muted">-</span>}</td>
                    <td className="px-5 py-3">
                      {x.official === null ? (
                        <span className="text-muted text-[12px]">n/a</span>
                      ) : x.ok ? (
                        <CheckCircle2 className="size-4 text-green-700 dark:text-green-400" aria-label="Matches" />
                      ) : (
                        <XCircle className="size-4 text-red-700 dark:text-red-400" aria-label="Differs" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody className="space-y-2 pt-4">
            <p className="text-ink text-[13px] font-semibold">Integrity checks (MARK-2)</p>
            {integrityErrors.length === 0 && integrity.flags.length === 0 && (
              <p className="flex items-center gap-2 text-[13px] text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-4" /> Subject marks add up and totals are standard.
              </p>
            )}
            {integrityErrors.map((e) => (
              <p key={e} className="flex items-center gap-2 text-[13px] text-red-700 dark:text-red-400">
                <XCircle className="size-4" /> {e}
              </p>
            ))}
            {integrity.flags.map((f) => (
              <p key={f} className="flex items-center gap-2 text-[13px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-4" /> {f.replace('NON_STANDARD_TOTAL: ', 'Non-standard total: ')}
              </p>
            ))}
            {profile && norm(profile.fullName) !== norm(r.studentName) && (
              <p className="flex items-center gap-2 text-[13px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-4" /> Profile name “{profile.fullName}” differs from the name on the
                record.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Result card" subtitle="Uploaded by the applicant" />
          <CardBody>
            <FilePreview fileId={r.resultCardFileId} className="h-[440px] w-full" />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Verification history" />
        <CardBody>
          <ol className="space-y-3">
            {history.map((h) => (
              <li
                key={h._id}
                className="border-line flex flex-wrap items-start justify-between gap-2 border-b pb-3 text-[13px] last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-ink font-semibold">
                    {h.method === 'REGISTRY'
                      ? 'Automatic registry check'
                      : `Officer decision${h.decidedBy ? ` by ${h.decidedBy.fullName}` : ''}`}
                  </p>
                  {h.note && <p className="text-muted">{h.note}</p>}
                </div>
                <div className="text-right">
                  <Badge
                    tone={
                      ['MATCH', 'VERIFIED'].includes(h.status) ? 'green' : h.status === 'NOT_FOUND' ? 'gray' : 'red'
                    }
                  >
                    {h.status.replace('_', ' ').toLowerCase()}
                  </Badge>
                  <p className="text-muted mt-1 text-[11.5px]">{formatDateTime(h.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <NoteDialog
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision === 'VERIFIED' ? 'Confirm verified' : 'Flag mismatch'}
        message={
          decision === 'VERIFIED'
            ? 'The record will be locked at trust level 3. Later changes by the applicant create a new version.'
            : 'The applicant will be asked to correct the record.'
        }
        confirmLabel={decision === 'VERIFIED' ? 'Confirm verified' : 'Flag mismatch'}
        noteLabel="Note for the audit trail"
        required
        variant={decision === 'VERIFIED' ? 'primary' : 'danger'}
        loading={decide.isPending}
        onSubmit={(note) => decision && decide.mutate({ decision, note })}
      />
    </div>
  );
}
