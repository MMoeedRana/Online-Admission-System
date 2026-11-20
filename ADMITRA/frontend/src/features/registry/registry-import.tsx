'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Download, FileSpreadsheet, RotateCcw, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FileDrop } from '@/components/ui/file-drop';
import { Field, Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { toast } from '@/components/ui/toast';
import { api, errorMessage, fieldErrors, getPaged, post } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Preview {
  summary: { rows: number; valid: number; errors: number; boards: string[]; years: number[]; levels: string[] };
  errors: { line: number; message: string }[];
  sample: {
    line: number;
    board: string;
    level: string;
    year: number;
    rollNo: string;
    studentName: string;
    obtained: number;
    total: number;
  }[];
}
interface Batch {
  _id: string;
  source: string;
  fileName: string;
  rowCount: number;
  errorCount: number;
  boards: string[];
  years: number[];
  status: string;
  createdAt: string;
  uploadedBy?: { fullName: string };
  canRollback: boolean;
}

const isDuplicate = (m: string) => /already in the registry|Duplicate roll number/.test(m);

export function RegistryImport({
  base,
  queryKey,
  template,
  intro,
}: {
  base: string;
  queryKey: unknown[];
  template: { href: string; label: string };
  intro: string;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [page, setPage] = useState(1);
  const [rollback, setRollback] = useState<Batch | null>(null);
  const batches = useQuery({
    queryKey: [...queryKey, 'batches', page],
    queryFn: () => getPaged<Batch>(`${base}/batches`, { page }),
  });

  const form = () => {
    const fd = new FormData();
    fd.append('file', file!);
    if (source) fd.append('source', source);
    return fd;
  };
  const check = useMutation({
    mutationFn: async () => (await api.post<{ data: Preview }>(`${base}/preview`, form())).data.data,
    onSuccess: setPreview,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const commit = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: { summary: Preview['summary']; rechecked: number } }>(`${base}/import`, form())).data
        .data,
    onSuccess: async (r) => {
      toast.success(`${formatNumber(r.summary.valid)} rows imported. ${r.rechecked} pending record(s) checked again.`);
      setFile(null);
      setPreview(null);
      setSource('');
      await qc.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      setSourceError(fieldErrors(e).source ?? '');
      toast.error(errorMessage(e));
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => post<{ removed: number; rechecked: number }>(`${base}/batches/${id}/rollback`),
    onSuccess: async (r) => {
      toast.success(`Batch rolled back: ${r.removed} rows removed, ${r.rechecked} record(s) checked again.`);
      setRollback(null);
      await qc.invalidateQueries({ queryKey });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const duplicates = preview?.errors.filter((e) => isDuplicate(e.message)).length ?? 0;
  const otherErrors = (preview?.summary.errors ?? 0) - duplicates;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Upload a result file"
          subtitle={intro}
          action={
            <a
              href={template.href}
              download
              className="text-primary inline-flex items-center gap-1.5 text-[13px] font-semibold"
            >
              <Download className="size-4" /> {template.label}
            </a>
          }
        />
        <CardBody className="space-y-4">
          <FileDrop
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hint="CSV or Excel (.xlsx), first row with the column names"
            file={file}
            onFile={(f) => {
              setFile(f);
              setPreview(null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<FileSpreadsheet className="size-4" />}
              disabled={!file}
              loading={check.isPending}
              onClick={() => check.mutate()}
            >
              Check file
            </Button>
          </div>
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardHeader
            title="Preview"
            subtitle={`${preview.summary.boards.join(', ') || 'No board'} · ${preview.summary.years.join(', ')}`}
          />
          <CardBody className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Tile label="Rows in file" value={preview.summary.rows} />
              <Tile
                label="Valid rows"
                value={preview.summary.valid}
                tone="green"
                icon={<CheckCircle2 className="size-4" />}
              />
              <Tile label="Duplicates" value={duplicates} tone="amber" icon={<Copy className="size-4" />} />
              <Tile label="Errors" value={otherErrors} tone="red" icon={<XCircle className="size-4" />} />
            </div>
            {preview.errors.length > 0 && (
              <div>
                <p className="text-ink mb-2 text-[13px] font-semibold">Error report (these rows are skipped)</p>
                <ul className="border-line max-h-56 space-y-1 overflow-y-auto rounded-xl border p-3 text-[12.5px]">
                  {preview.errors.map((e, i) => (
                    <li
                      key={i}
                      className={
                        isDuplicate(e.message) ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-400'
                      }
                    >
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.sample.length > 0 && (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead>
                    <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
                      <th className="px-3 py-2 font-semibold">Line</th>
                      <th className="px-3 py-2 font-semibold">Board</th>
                      <th className="px-3 py-2 font-semibold">Roll no.</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r) => (
                      <tr key={r.line} className="border-line border-b">
                        <td className="px-3 py-2">{r.line}</td>
                        <td className="px-3 py-2">{r.board}</td>
                        <td className="px-3 py-2">{r.rollNo}</td>
                        <td className="px-3 py-2">{r.studentName}</td>
                        <td className="px-3 py-2">
                          {r.obtained}/{r.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field
                label="Official source"
                htmlFor="source"
                required
                error={sourceError}
                hint="For example: BISE Faisalabad gazette, Intermediate Annual 2025 (official website)."
              >
                <Input
                  placeholder="e.g. BISE Faisalabad result gazette 2025"
                  id="source"
                  value={source}
                  onChange={(e) => (setSource(e.target.value), setSourceError(''))}
                />
              </Field>
              <Button
                icon={<Upload className="size-4" />}
                disabled={!preview.summary.valid || source.trim().length < 5}
                loading={commit.isPending}
                onClick={() => commit.mutate()}
              >
                Import {formatNumber(preview.summary.valid)} rows
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="Import batches" subtitle="A batch can be rolled back within 7 days." />
        <div className="mt-4">
          <DataTable
            loading={batches.isLoading}
            rows={batches.data?.data ?? []}
            rowKey={(b) => b._id}
            empty={
              <EmptyState icon={FileSpreadsheet} title="No imports yet" text="Imported result files appear here." />
            }
            columns={[
              {
                key: 'src',
                header: 'Source',
                primary: true,
                cell: (b) => (
                  <div>
                    <p className="text-ink font-semibold">{b.source}</p>
                    <p className="text-muted text-[12px]">{b.fileName}</p>
                  </div>
                ),
              },
              { key: 'rows', header: 'Rows', cell: (b) => formatNumber(b.rowCount) },
              {
                key: 'boards',
                header: 'Boards / years',
                cell: (b) => `${b.boards.join(', ')} · ${b.years.join(', ')}`,
                hideOnMobile: true,
              },
              {
                key: 'by',
                header: 'Imported',
                cell: (b) => `${formatDateTime(b.createdAt)}${b.uploadedBy ? ` by ${b.uploadedBy.fullName}` : ''}`,
              },
              { key: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
              {
                key: 'rb',
                header: '',
                className: 'text-right',
                cell: (b) =>
                  b.canRollback ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<RotateCcw className="size-4" />}
                      onClick={() => setRollback(b)}
                    >
                      Roll back
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Pagination meta={batches.data?.meta} onPage={setPage} className="p-4" />
        </div>
      </Card>
      <ConfirmDialog
        open={Boolean(rollback)}
        onClose={() => setRollback(null)}
        title="Roll back batch"
        message={`All ${rollback?.rowCount ?? 0} rows of “${rollback?.source ?? ''}” will be removed and the records matched with them checked again.`}
        confirmLabel="Roll back"
        loading={undo.isPending}
        onConfirm={() => rollback && undo.mutate(rollback._id)}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'amber' | 'red';
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tone === 'green' &&
          'border-green-200 bg-green-50 text-green-800 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-200',
        tone === 'amber' &&
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
        tone === 'red' &&
          'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200',
        !tone && 'border-line bg-card-soft text-ink',
      )}
    >
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium opacity-80">
        {icon} {label}
      </p>
      <p className="mt-1 text-[24px] font-extrabold">{formatNumber(value)}</p>
    </div>
  );
}
