'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, History, Lock, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { RecordBadge, TrustChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { api, del, errorMessage, get } from '@/lib/api';
import { openFile } from '@/lib/files';
import { formatDateTime } from '@/lib/format';
import { ProfileTabs } from './profile-tabs';
import { RecordModal } from './record-modal';
import { LEVEL_LABELS, type AcademicRecord } from './types';

const TRUST = [
  ['Declared', 'Typed by you, not checked'],
  ['Document attached', 'Result card uploaded'],
  ['Registry verified', 'Matched with board result'],
  ['Officer verified', 'Confirmed and locked'],
];

export function RecordsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'records'], queryFn: () => get<AcademicRecord[]>('/me/records') });
  const [editing, setEditing] = useState<AcademicRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AcademicRecord | null>(null);
  const [history, setHistory] = useState<AcademicRecord | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/me/records/${id}`),
    onSuccess: () => (toast.success('Record deleted.'), refresh(), setDeleting(null)),
    onError: (e) => (toast.error(errorMessage(e)), setDeleting(null)),
  });
  if (!q.data) return <FullPageLoader />;
  return (
    <>
      <PageHeader
        title="Academic record"
        subtitle="Your marks are verified before they can be used in a merit list"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add result
          </Button>
        }
      />
      <ProfileTabs active="records" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {q.data.length === 0 && (
            <Card>
              <EmptyState
                icon={Plus}
                title="No results added yet"
                text="Add your Matric and Intermediate results subject by subject. They are checked against the official board results."
                action={<Button onClick={() => setEditing('new')}>Add result</Button>}
              />
            </Card>
          )}
          {q.data.map((r) => (
            <RecordCard
              key={r._id}
              record={r}
              onEdit={() => setEditing(r)}
              onDelete={() => setDeleting(r)}
              onHistory={() => setHistory(r)}
              onChanged={refresh}
            />
          ))}
        </div>
        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-bold">Trust levels</h2>
            <ul className="mt-4 space-y-3">
              {TRUST.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <TrustChip level={i} />
                  <div>
                    <p className="text-ink text-[13.5px] font-semibold">{t}</p>
                    <p className="text-muted text-[12px]">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                <b>Only real marks count.</b> Verified records are locked. Editing creates a new version that must be
                verified again. False marks lead to rejection or cancellation of admission.
              </span>
            </p>
          </div>
        </aside>
      </div>
      {editing && (
        <RecordModal
          record={editing === 'new' ? null : editing}
          existing={q.data}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {history && <HistoryModal record={history} onClose={() => setHistory(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete result"
        message="This result will be removed. Verified results and results used in a submitted application cannot be deleted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting._id)}
      />
    </>
  );
}

function RecordCard({
  record: r,
  onEdit,
  onDelete,
  onHistory,
  onChanged,
}: {
  record: AcademicRecord;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/me/records/${r._id}/result-card`, fd);
    },
    onSuccess: () => (toast.success('Result card uploaded.'), onChanged()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const name = r.level === 'ENTRY_TEST' ? r.testName || 'Entry test' : LEVEL_LABELS[r.level]?.split(' /')[0];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <p className="text-ink text-[15px] font-bold">
            {name} · {r.board} · {r.year}
          </p>
          <p className="text-muted text-[12.5px]">
            Roll no. {r.rollNo} · {r.obtained} / {r.total} ({r.percentage}%){r.group ? ` · ${r.group}` : ''}
            {r.version > 1 ? ` · version ${r.version}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TrustChip level={r.trustLevel} />
          <RecordBadge status={r.verificationStatus} />
          {r.locked ? (
            <span className="border-line text-muted inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold">
              <Lock className="size-3.5" /> Locked
            </span>
          ) : null}
          <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
      {r.verificationStatus === 'MISMATCH' && r.registryDiff.length > 0 && (
        <Alert tone="error" className="mx-5 mb-4" title="Your marks do not match the official result">
          {r.registryDiff.map((d) => (
            <p key={d.field}>
              {d.field.replace('subject:', '')}: you entered <b>{String(d.entered ?? '-')}</b>, official result shows{' '}
              <b>{String(d.official ?? '-')}</b>.
            </p>
          ))}
        </Alert>
      )}
      {r.flags.length > 0 && (
        <p className="mx-5 mb-3 text-[12px] text-amber-700 dark:text-amber-300">
          Note: the total marks are not the standard total for this year; an officer will check your result card.
        </p>
      )}
      {r.subjects.length > 0 && (
        <div className="border-line overflow-x-auto border-t">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="bg-card-soft text-muted text-[11.5px] tracking-wider uppercase">
                <th className="px-5 py-2.5 font-semibold">Subject</th>
                <th className="px-4 py-2.5 font-semibold">Obtained</th>
                <th className="px-5 py-2.5 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {r.subjects.map((s) => (
                <tr key={s.name} className="border-line border-t">
                  <td className="text-ink px-5 py-2.5">{s.name}</td>
                  <td className="px-4 py-2.5">{s.obtained}</td>
                  <td className="px-5 py-2.5">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-line bg-card-soft/60 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
        {r.resultCardFileId ? (
          <button
            className="text-primary inline-flex items-center gap-2 text-[13px] font-semibold"
            onClick={() => void openFile(`/files/${r.resultCardFileId}`)}
          >
            <Upload className="size-4" /> Result card uploaded · view
          </button>
        ) : (
          <span className="text-muted text-[13px]">
            {r.trustLevel >= 2
              ? 'Verified from the board result; no result card needed.'
              : 'Upload your result card (DMC) so an officer can verify your marks.'}
          </span>
        )}
        <div className="flex items-center gap-1">
          {!r.locked && (
            <>
              <input
                ref={input}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
              />
              <Button
                size="sm"
                variant="soft"
                loading={upload.isPending}
                icon={<Upload className="size-3.5" />}
                onClick={() => input.current?.click()}
              >
                {r.resultCardFileId ? 'Replace card' : 'Upload result card'}
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" aria-label="Versions and checks" onClick={onHistory}>
            <History className="size-4" />
          </Button>
          {!r.locked && r.trustLevel < 2 && (
            <Button size="icon" variant="ghost" aria-label="Delete" onClick={onDelete}>
              <Trash2 className="size-4 text-red-600" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function HistoryModal({ record, onClose }: { record: AcademicRecord; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['me', 'record-history', record._id],
    queryFn: () =>
      get<{
        versions: AcademicRecord[];
        checks: { _id: string; method: string; status: string; note: string; createdAt: string }[];
      }>(`/me/records/${record._id}/history`),
  });
  const label: Record<string, string> = {
    MATCH: 'Matched with the board result',
    NOT_FOUND: 'Roll number not found in the board result',
    MISMATCH: 'Differences found',
    VERIFIED: 'Verified by an officer',
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Versions and verification history"
      description="All versions of this result are kept (MARK-8)."
    >
      {!q.data ? (
        <FullPageLoader />
      ) : (
        <div className="space-y-5">
          <ul className="space-y-2">
            {q.data.versions.map((v) => (
              <li
                key={v._id}
                className="border-line flex items-center justify-between rounded-xl border p-3 text-[13px]"
              >
                <span>
                  <b className="text-ink">Version {v.version}</b> · {v.obtained}/{v.total} ({v.percentage}%)
                </span>
                <RecordBadge status={v.verificationStatus} />
              </li>
            ))}
          </ul>
          <ul className="space-y-2">
            {q.data.checks.map((c) => (
              <li key={c._id} className="text-[13px]">
                <span className="text-ink font-semibold">
                  {c.method === 'OFFICER' ? 'Officer' : 'Automatic check'}:
                </span>{' '}
                {label[c.status] ?? c.status}
                {c.note ? ` - ${c.note}` : ''} <span className="text-muted">({formatDateTime(c.createdAt)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
