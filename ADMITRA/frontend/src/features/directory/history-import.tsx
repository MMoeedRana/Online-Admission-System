'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FileDrop } from '@/components/ui/file-drop';
import { Field, Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { api, errorMessage, fieldErrors } from '@/lib/api';

interface Preview {
  rows: number;
  valid: number;
  errors: { line: number; message: string }[];
  sample: { line: number; year: number; round: number; shift: string; closingMerit: number }[];
}

/** DIR-3: merit history from a CSV or Excel file; a source is mandatory and rows stay DRAFT. */
export function HistoryImport({ base, onDone }: { base: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const form = () => {
    const fd = new FormData();
    fd.append('file', file!);
    if (source) fd.append('source', source);
    return fd;
  };
  const check = useMutation({
    mutationFn: async () => (await api.post<{ data: Preview }>(`${base}/import/preview`, form())).data.data,
    onSuccess: setPreview,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const commit = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: { saved: number; skipped: number } }>(`${base}/import`, form())).data.data,
    onSuccess: (r) => {
      toast.success(
        `${r.saved} rows saved as draft${r.skipped ? `, ${r.skipped} verified rows kept` : ''}. They are used after verification.`,
      );
      setFile(null);
      setPreview(null);
      setSource('');
      onDone();
    },
    onError: (e) => {
      setErr(fieldErrors(e).source ?? '');
      toast.error(errorMessage(e));
    },
  });
  return (
    <Card>
      <CardHeader
        title="Import merit history"
        subtitle="Columns: institution, program, year, round, shift, quota, opening_merit, closing_merit, seats, source_url"
        action={
          <a
            href="/templates/merit-history-template.csv"
            download
            className="text-primary inline-flex items-center gap-1.5 text-[13px] font-semibold"
          >
            <Download className="size-4" /> Template
          </a>
        }
      />
      <CardBody className="space-y-4">
        <FileDrop
          accept=".csv,.xlsx"
          hint="CSV or Excel (.xlsx)"
          file={file}
          onFile={(f) => (setFile(f), setPreview(null))}
        />
        <Button
          variant="secondary"
          icon={<FileSpreadsheet className="size-4" />}
          disabled={!file}
          loading={check.isPending}
          onClick={() => check.mutate()}
        >
          Check file
        </Button>
        {preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card-soft rounded-xl p-3">
                <p className="text-muted text-[12px]">Rows</p>
                <p className="text-[22px] font-extrabold">{preview.rows}</p>
              </div>
              <div className="rounded-xl bg-green-50 p-3 text-green-800 dark:bg-green-500/10 dark:text-green-200">
                <p className="flex items-center gap-1 text-[12px]">
                  <CheckCircle2 className="size-3.5" /> Valid
                </p>
                <p className="text-[22px] font-extrabold">{preview.valid}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3 text-red-800 dark:bg-red-500/10 dark:text-red-200">
                <p className="flex items-center gap-1 text-[12px]">
                  <XCircle className="size-3.5" /> Errors
                </p>
                <p className="text-[22px] font-extrabold">{preview.errors.length}</p>
              </div>
            </div>
            {preview.errors.length > 0 && (
              <ul className="border-line max-h-40 space-y-1 overflow-y-auto rounded-xl border p-3 text-[12.5px] text-red-700 dark:text-red-400">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field
                label="Official source"
                htmlFor="h-source"
                required
                error={err}
                hint="For example: merit lists 2025 published on the university website."
              >
                <Input
                  placeholder="e.g. Official merit list PDF 2025"
                  id="h-source"
                  value={source}
                  onChange={(e) => (setSource(e.target.value), setErr(''))}
                />
              </Field>
              <Button
                icon={<Upload className="size-4" />}
                disabled={!preview.valid || source.trim().length < 5}
                loading={commit.isPending}
                onClick={() => commit.mutate()}
              >
                Import {preview.valid} rows
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
