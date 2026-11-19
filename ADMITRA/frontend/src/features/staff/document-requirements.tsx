'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { useInstKey } from '@/features/institution/hooks';
import { del, errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { DEGREE_LEVELS } from '@/lib/constants';

interface DocType {
  _id: string;
  name: string;
  code: string;
  description: string;
  formats: string[];
  maxSizeMB: number;
  required: boolean;
  degreeLevels: string[];
  active: boolean;
  order: number;
}
type Form = Omit<DocType, '_id'>;
const EMPTY: Form = {
  name: '',
  code: '',
  description: '',
  formats: ['PDF', 'JPG', 'PNG'],
  maxSizeMB: 2,
  required: true,
  degreeLevels: [],
  active: true,
  order: 0,
};
const FORMATS = ['PDF', 'JPG', 'PNG'];

/** DOC-1: which documents applicants must upload, with formats and size limits. */
export function DocumentRequirements() {
  const key = useInstKey();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: key('document-types'), queryFn: () => get<DocType[]>('/document-types') });
  const [edit, setEdit] = useState<{ id: string | null; form: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<DocType | null>(null);
  const save = useMutation({
    mutationFn: () =>
      edit!.id ? patch(`/document-types/${edit!.id}`, edit!.form) : post('/document-types', edit!.form),
    onSuccess: async () => {
      toast.success('Document requirement saved.');
      setEdit(null);
      await qc.invalidateQueries({ queryKey: key('document-types') });
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit((e) => e && { ...e, form: { ...e.form, [k]: v } });
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const f = edit?.form;

  return (
    <>
      <PageHeader
        title="Document Requirements"
        subtitle="Documents applicants upload with their application"
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => (setErrors({}), setEdit({ id: null, form: EMPTY }))}
          >
            Add document
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={list.isLoading}
          rows={list.data ?? []}
          rowKey={(d) => d._id}
          empty={
            <EmptyState
              icon={FileCheck2}
              title="No document requirements"
              text="Add the documents applicants must upload."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Document',
              primary: true,
              cell: (d) => (
                <div>
                  <p className="text-ink font-semibold">{d.name}</p>
                  <p className="text-muted text-[12px]">{d.description || d.code}</p>
                </div>
              ),
            },
            { key: 'formats', header: 'Formats', cell: (d) => `${d.formats.join(', ')} · ${d.maxSizeMB} MB` },
            {
              key: 'for',
              header: 'Applies to',
              cell: (d) =>
                d.degreeLevels.length
                  ? d.degreeLevels.map((l) => DEGREE_LEVELS[l as keyof typeof DEGREE_LEVELS] ?? l).join(', ')
                  : 'All programs',
            },
            {
              key: 'req',
              header: 'Required',
              cell: (d) => (d.required ? <Badge tone="blue">Required</Badge> : <Badge tone="gray">Optional</Badge>),
            },
            {
              key: 'active',
              header: 'Status',
              cell: (d) => (d.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>),
            },
            {
              key: 'act',
              header: '',
              className: 'text-right',
              cell: (d) => (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${d.name}`}
                    icon={<Pencil className="size-4" />}
                    onClick={() => (setErrors({}), setEdit({ id: d._id, form: { ...EMPTY, ...d } }))}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${d.name}`}
                    icon={<Trash2 className="size-4 text-red-600" />}
                    onClick={() => setRemove(d)}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit document requirement' : 'Add document requirement'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        {f && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="d-name" required error={errors.name}>
              <Input id="d-name" value={f.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Code" htmlFor="d-code" required error={errors.code}>
              <Input id="d-code" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
            </Field>
            <Field
              label="Instructions for applicants"
              htmlFor="d-desc"
              className="sm:col-span-2"
              error={errors.description}
            >
              <Textarea
                id="d-desc"
                rows={2}
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <Field label="Formats" required error={errors.formats}>
              <div className="flex gap-2">
                {FORMATS.map((x) => (
                  <Checkbox
                    key={x}
                    label={x}
                    className="flex-1 p-2.5"
                    checked={f.formats.includes(x)}
                    onChange={() => set('formats', toggle(f.formats, x))}
                  />
                ))}
              </div>
            </Field>
            <Field label="Maximum size (MB)" htmlFor="d-size" required error={errors.maxSizeMB}>
              <Input
                id="d-size"
                type="number"
                step="0.5"
                min="0.1"
                max="10"
                value={f.maxSizeMB}
                onChange={(e) => set('maxSizeMB', Number(e.target.value))}
              />
            </Field>
            <Field label="Applies to degree levels" hint="Leave empty for every program." className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(DEGREE_LEVELS).map(([v, l]) => (
                  <Checkbox
                    key={v}
                    label={l}
                    className="p-2.5"
                    checked={f.degreeLevels.includes(v)}
                    onChange={() => set('degreeLevels', toggle(f.degreeLevels, v))}
                  />
                ))}
              </div>
            </Field>
            <Checkbox
              label="Required"
              description="The application cannot be submitted without it."
              checked={f.required}
              onChange={(e) => set('required', e.target.checked)}
            />
            <Checkbox
              label="Active"
              description="Inactive documents are not asked for."
              checked={f.active}
              onChange={(e) => set('active', e.target.checked)}
            />
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        title="Delete document requirement"
        message={`“${remove?.name ?? ''}” will be deleted. If applicants have uploaded it, mark it inactive instead.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await del(`/document-types/${remove!._id}`);
            setRemove(null);
            toast.success('Deleted.');
            await qc.invalidateQueries({ queryKey: key('document-types') });
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </>
  );
}
