'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge, RecordBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileDrop } from '@/components/ui/file-drop';
import { Select } from '@/components/ui/input';
import { Stepper } from '@/components/ui/stepper';
import { toast } from '@/components/ui/toast';
import { api, del, errorMessage, get, post, put } from '@/lib/api';
import { DEGREE_LEVELS, SHIFTS } from '@/lib/constants';
import { openFile } from '@/lib/files';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LEVEL_LABELS, type AcademicRecord, type AppDetail, type DocType } from './types';

const STEPS = ['Programs', 'Eligibility', 'Documents', 'Review & submit'];
const ACCEPT: Record<string, string> = { PDF: 'application/pdf', JPG: 'image/jpeg', PNG: 'image/png' };

export function Wizard({ data, refresh }: { data: AppDetail; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const max = data.campaign.settings.maxPreferences;
  const [prefs, setPrefs] = useState(() =>
    Object.fromEntries(
      data.programs.map((p) => {
        const chosen = data.application.preferences.find((x) => x.programId === p._id);
        return [
          p._id,
          { rank: chosen ? String(chosen.order) : '', shift: chosen?.shift ?? p.shifts[0]?.name ?? 'MORNING' },
        ];
      }),
    ),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const records = useQuery({ queryKey: ['me', 'records'], queryFn: () => get<AcademicRecord[]>('/me/records') });

  const chosen = Object.entries(prefs)
    .filter(([, v]) => v.rank)
    .sort((a, b) => Number(a[1].rank) - Number(b[1].rank));
  const ranksValid = new Set(chosen.map(([, v]) => v.rank)).size === chosen.length;

  const savePrefs = useMutation({
    mutationFn: () =>
      put(`/me/applications/${data.application._id}/preferences`, {
        preferences: chosen.map(([programId, v]) => ({ programId, shift: v.shift })),
      }),
    onSuccess: async () => {
      await refresh();
      setStep(1);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = useMutation({
    mutationFn: () => post(`/me/applications/${data.application._id}/submit`),
    onSuccess: async () => {
      toast.success('Application submitted. Please pay the application fee.');
      await refresh();
      router.replace(`/applicant/applications/${data.application._id}/payment`);
    },
    onError: async (e) => {
      toast.error(errorMessage(e));
      await refresh();
    },
  });

  const selectedPrograms = data.application.preferences
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ pref: p, program: data.programs.find((x) => x._id === p.programId)! }))
    .filter((x) => x.program);
  const academic = (records.data ?? []).filter((r) => r.level !== 'ENTRY_TEST');
  const verifiedAll = academic.length > 0 && academic.every((r) => r.trustLevel >= 2);
  const cardsMissing = academic.some((r) => r.trustLevel < 2 && !r.resultCardFileId);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/applicant/applications"
            className="text-muted hover:text-primary mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold"
          >
            <ArrowLeft className="size-3.5" /> My applications
          </Link>
          <h1 className="text-[22px] font-bold tracking-tight">Apply to {data.institution.name}</h1>
          <p className="text-muted mt-1 text-[13.5px]">
            {data.campaign.title} · closes {formatDate(data.campaign.closesAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="gray">Draft saved</Badge>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-4 text-red-600" />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete draft
          </Button>
        </div>
      </div>
      <Card className="mb-6 px-4 py-4 sm:px-6">
        <Stepper
          steps={STEPS}
          current={step}
          onStep={(i) => (i === 0 || data.application.preferences.length ? setStep(i) : undefined)}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {step === 0 && (
            <Card className="overflow-hidden">
              <CardHeader
                title={`Choose up to ${max} program${max > 1 ? 's' : ''} in order of preference`}
                subtitle="Give number 1 to the program you want most. Programs you are not eligible for cannot be chosen."
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13.5px]">
                  <thead>
                    <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                      <th className="px-5 py-3 font-semibold">Program</th>
                      <th className="px-3 py-3 font-semibold">Seats</th>
                      <th className="px-3 py-3 font-semibold">Eligibility</th>
                      <th className="px-3 py-3 font-semibold">Shift</th>
                      <th className="px-5 py-3 font-semibold">Preference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.programs.map((p) => {
                      const v = prefs[p._id]!;
                      const reason = p.eligibility.checks.find((c) => !c.ok)?.reason;
                      return (
                        <tr key={p._id} className="border-line border-b last:border-0">
                          <td className="px-5 py-3.5">
                            <p className="text-ink font-semibold">{p.title}</p>
                            <p className="text-muted text-[12px]">
                              {DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS]} · fee{' '}
                              {formatMoney(p.applicationFee)}
                            </p>
                          </td>
                          <td className="px-3 py-3.5">{p.seatCap ?? p.shifts.reduce((s, x) => s + x.seats, 0)}</td>
                          <td className="px-3 py-3.5">
                            {p.eligibility.eligible ? (
                              <Badge tone="green">Eligible</Badge>
                            ) : (
                              <Badge tone="red">{reason?.split(': ').slice(-1)[0] ?? 'Not eligible'}</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3.5">
                            <Select
                              className="h-9 w-32"
                              value={v.shift}
                              onChange={(e) => setPrefs({ ...prefs, [p._id]: { ...v, shift: e.target.value } })}
                              aria-label={`Shift for ${p.title}`}
                            >
                              {p.shifts.map((s) => (
                                <option key={s.name} value={s.name}>
                                  {SHIFTS[s.name as keyof typeof SHIFTS]}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-5 py-3.5">
                            <Select
                              className="h-9 w-20"
                              value={v.rank}
                              disabled={!p.eligibility.eligible && !v.rank}
                              onChange={(e) => setPrefs({ ...prefs, [p._id]: { ...v, rank: e.target.value } })}
                              aria-label={`Preference for ${p.title}`}
                            >
                              <option value="">-</option>
                              {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
                                <option key={n}>{n}</option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!ranksValid && (
                <p className="px-6 pt-3 text-[12.5px] font-medium text-red-600">
                  Each preference number can be used once.
                </p>
              )}
              <div className="flex justify-end p-5">
                <Button
                  disabled={!chosen.length || !ranksValid}
                  loading={savePrefs.isPending}
                  onClick={() => savePrefs.mutate()}
                  icon={<ArrowRight className="size-4" />}
                >
                  Save and continue
                </Button>
              </div>
            </Card>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {selectedPrograms.map(({ pref, program }) => (
                <Card key={program._id}>
                  <CardHeader
                    title={`${pref.order}. ${program.title}`}
                    subtitle={`${SHIFTS[pref.shift as keyof typeof SHIFTS]} shift`}
                    action={
                      program.eligibility.eligible ? (
                        <Badge tone="green">Eligible</Badge>
                      ) : (
                        <Badge tone="red">Not eligible</Badge>
                      )
                    }
                  />
                  <CardBody className="space-y-2">
                    {program.eligibility.checks.length === 0 && (
                      <p className="text-muted text-[13px]">No minimum requirements.</p>
                    )}
                    {program.eligibility.checks.map((c) => (
                      <p key={c.level} className="flex items-start gap-2 text-[13.5px]">
                        {c.ok ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                        ) : (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                        )}
                        {c.reason}
                      </p>
                    ))}
                  </CardBody>
                </Card>
              ))}
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button onClick={() => setStep(2)} icon={<ArrowRight className="size-4" />}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {data.documentTypes.map((t) => (
                <DocumentUpload key={t._id} appId={data.application._id} type={t} data={data} refresh={refresh} />
              ))}
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)} icon={<ArrowRight className="size-4" />}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {data.missing.length > 0 ? (
                <Alert tone="error" title="Complete these items before submitting (APP-3)">
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {data.missing.map((m) => (
                      <li key={m.key}>{m.message}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    <Link href="/applicant/profile" className="font-semibold underline">
                      Profile
                    </Link>{' '}
                    ·{' '}
                    <Link href="/applicant/records" className="font-semibold underline">
                      Academic record
                    </Link>
                  </p>
                </Alert>
              ) : (
                <Alert tone="info" title="Ready to submit">
                  After submission your programs, details and documents cannot be changed (APP-5). A fee challan will be
                  issued.
                </Alert>
              )}
              <Card>
                <CardHeader title="Programs" />
                <CardBody className="space-y-2 text-[13.5px]">
                  {selectedPrograms.map(({ pref, program }) => (
                    <p key={program._id}>
                      <b className="text-ink">{pref.order}.</b> {program.title} (
                      {SHIFTS[pref.shift as keyof typeof SHIFTS]})
                    </p>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Academic record" />
                <CardBody className="space-y-2">
                  {records.data?.map((r) => (
                    <div key={r._id} className="flex items-center justify-between gap-3 text-[13.5px]">
                      <span>
                        {LEVEL_LABELS[r.level]} · {r.obtained}/{r.total} ({r.percentage}%)
                      </span>
                      <RecordBadge status={r.verificationStatus} />
                    </div>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Documents" />
                <CardBody className="space-y-2 text-[13.5px]">
                  {data.documentTypes.map((t) => {
                    const d = data.documents.find((x) => x.current && x.documentTypeId === t._id);
                    return (
                      <div key={t._id} className="flex items-center justify-between gap-3">
                        <span>{t.name}</span>
                        {d ? (
                          <StatusBadge status={d.status} />
                        ) : (
                          <Badge tone={t.required ? 'red' : 'gray'}>{t.required ? 'Missing' : 'Optional'}</Badge>
                        )}
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  size="lg"
                  disabled={data.missing.length > 0}
                  loading={submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  Submit application
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-bold">Fee summary</h2>
            <dl className="mt-4 space-y-2 text-[13.5px]">
              {data.fee.items.map((i) => (
                <div key={i.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{i.label}</dt>
                  <dd className="text-ink font-semibold">{formatMoney(i.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Marks verification</dt>
                <dd className="text-ink font-semibold">Free</dd>
              </div>
              <div className="border-line flex items-end justify-between border-t pt-3">
                <dt className="text-ink font-semibold">Total due</dt>
                <dd className="text-ink text-[22px] font-extrabold">{formatMoney(data.fee.amount)}</dd>
              </div>
            </dl>
            <p className="text-muted mt-2 text-[12px]">
              {data.campaign.settings.feePolicy === 'SUM'
                ? 'Sum of the fees of your programs.'
                : 'Highest application fee of your programs.'}
            </p>
          </Card>
          <div
            className={cn(
              'flex gap-3 rounded-2xl border p-4 text-[13px]',
              verifiedAll
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-200'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
            )}
          >
            <ShieldCheck className="size-5 shrink-0" />
            <p>
              {verifiedAll ? (
                <>
                  <b>Your marks are ready.</b> Matric and Intermediate records are verified.
                </>
              ) : (
                <>
                  <b>Some marks are not verified yet.</b>{' '}
                  {cardsMissing ? (
                    <>
                      Upload your result cards in{' '}
                      <Link href="/applicant/records" className="underline">
                        Academic record
                      </Link>
                      .
                    </>
                  ) : (
                    'The admission office will check them against your result cards.'
                  )}
                </>
              )}
            </p>
          </div>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete draft"
        message="This draft and its uploaded documents will be deleted."
        confirmLabel="Delete draft"
        onConfirm={async () => {
          try {
            await del(`/me/applications/${data.application._id}`);
            setConfirmDelete(false);
            await refresh();
            router.replace('/applicant/applications');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </>
  );
}

export function DocumentUpload({
  appId,
  type,
  data,
  refresh,
  replaceOnly,
}: {
  appId: string;
  type: DocType;
  data: AppDetail;
  refresh: () => Promise<unknown>;
  replaceOnly?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const current = data.documents.find((d) => d.current && d.documentTypeId === type._id);
  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('documentTypeId', type._id);
      fd.append('file', file!);
      return api.post(`/me/applications/${appId}/documents`, fd);
    },
    onSuccess: async () => {
      toast.success(`${type.name} uploaded.`);
      setFile(null);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rejected = current?.status === 'REJECTED';
  const canUpload = !replaceOnly || rejected;
  return (
    <Card className={cn('p-5', rejected && 'border-red-300 dark:border-red-500/40')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-ink text-[14.5px] font-bold">
            {type.name}{' '}
            {type.required ? (
              <span className="text-red-500">*</span>
            ) : (
              <span className="text-muted text-[12px] font-medium">(optional)</span>
            )}
          </p>
          <p className="text-muted text-[12.5px]">
            {type.description} {type.formats.join(', ')} up to {type.maxSizeMB} MB.
          </p>
        </div>
        {current && <StatusBadge status={current.status} />}
      </div>
      {current && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <button className="text-primary font-semibold" onClick={() => void openFile(`/files/${current.fileId._id}`)}>
            {current.fileId.originalName || 'View file'}
          </button>
          <span className="text-muted">version {current.version}</span>
          {rejected && current.reviewTrail.at(-1)?.reason && (
            <span className="text-red-600">Reason: {current.reviewTrail.at(-1)!.reason}</span>
          )}
        </div>
      )}
      {canUpload && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <FileDrop
            compact
            accept={type.formats.map((f) => ACCEPT[f]).join(',')}
            hint={`${type.formats.join(', ')} up to ${type.maxSizeMB} MB`}
            file={file}
            onFile={setFile}
          />
          <Button disabled={!file} loading={upload.isPending} onClick={() => upload.mutate()}>
            {current ? 'Replace' : 'Upload'}
          </Button>
        </div>
      )}
    </Card>
  );
}
