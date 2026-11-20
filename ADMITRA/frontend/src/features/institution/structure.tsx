'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building, CalendarDays, Landmark, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { del, errorMessage, fieldErrors, patch, post } from '@/lib/api';
import { formatDate, toDateInput } from '@/lib/format';
import type { AcademicSession, Campus, Department, Faculty } from '@/lib/types';
import { useInstKey, useStructure, type Structure } from './hooks';

type Tab = 'campuses' | 'faculties' | 'departments' | 'sessions';
type Values = Record<string, string | boolean | string[]>;

interface EntityConfig<T extends { _id: string }> {
  title: string;
  plural: string;
  path: string;
  icon: typeof Building;
  empty: string;
  columns: (s: Structure) => Column<T>[];
  initial: (row?: T) => Values;
  fields: (
    v: Values,
    set: (k: string, val: Values[string]) => void,
    errors: Record<string, string>,
    s: Structure,
  ) => ReactNode;
}

const campusCfg: EntityConfig<Campus> = {
  title: 'Campus',
  plural: 'campuses',
  path: '/structure/campuses',
  icon: Building,
  empty: 'Add the main campus of your institution.',
  columns: () => [
    {
      key: 'name',
      header: 'Campus',
      primary: true,
      cell: (c) => (
        <span className="text-ink font-semibold">
          {c.name}{' '}
          {c.isMain && (
            <Badge tone="blue" dot={false}>
              Main
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'code', header: 'Code', cell: (c) => c.code },
    { key: 'city', header: 'City', cell: (c) => c.city },
    { key: 'address', header: 'Address', cell: (c) => c.address || '-', hideOnMobile: true },
  ],
  initial: (r) => ({
    name: r?.name ?? '',
    code: r?.code ?? '',
    city: r?.city ?? '',
    address: r?.address ?? '',
    isMain: r?.isMain ?? false,
  }),
  fields: (v, set, e) => (
    <>
      <Field label="Name" htmlFor="f-name" required error={e.name}>
        <Input
          placeholder="e.g. Main Campus"
          id="f-name"
          value={v.name as string}
          onChange={(x) => set('name', x.target.value)}
        />
      </Field>
      <Field label="Code" htmlFor="f-code" required error={e.code}>
        <Input
          placeholder="e.g. MAIN"
          id="f-code"
          className="uppercase"
          value={v.code as string}
          onChange={(x) => set('code', x.target.value)}
        />
      </Field>
      <Field label="City" htmlFor="f-city" required error={e.city}>
        <Input
          placeholder="e.g. Faisalabad"
          id="f-city"
          value={v.city as string}
          onChange={(x) => set('city', x.target.value)}
        />
      </Field>
      <Field label="Address" htmlFor="f-addr" error={e.address}>
        <Input
          placeholder="Street and area"
          id="f-addr"
          value={v.address as string}
          onChange={(x) => set('address', x.target.value)}
        />
      </Field>
      <Checkbox
        className="sm:col-span-2"
        label="Main campus"
        description="Only one campus can be the main campus."
        checked={v.isMain as boolean}
        onChange={(x) => set('isMain', x.target.checked)}
      />
    </>
  ),
};

const facultyCfg: EntityConfig<Faculty> = {
  title: 'Faculty',
  plural: 'faculties',
  path: '/structure/faculties',
  icon: Landmark,
  empty: 'Faculties group your departments, for example Faculty of Computing.',
  columns: (s) => [
    {
      key: 'name',
      header: 'Faculty',
      primary: true,
      cell: (f) => <span className="text-ink font-semibold">{f.name}</span>,
    },
    { key: 'code', header: 'Code', cell: (f) => f.code },
    { key: 'deps', header: 'Departments', cell: (f) => s.departments.filter((d) => d.facultyId === f._id).length },
  ],
  initial: (r) => ({ name: r?.name ?? '', code: r?.code ?? '' }),
  fields: (v, set, e) => (
    <>
      <Field label="Name" htmlFor="f-name" required error={e.name}>
        <Input
          placeholder="e.g. Faculty of Computing"
          id="f-name"
          value={v.name as string}
          onChange={(x) => set('name', x.target.value)}
        />
      </Field>
      <Field label="Code" htmlFor="f-code" required error={e.code}>
        <Input
          placeholder="e.g. FOC"
          id="f-code"
          className="uppercase"
          value={v.code as string}
          onChange={(x) => set('code', x.target.value)}
        />
      </Field>
    </>
  ),
};

const departmentCfg: EntityConfig<Department> = {
  title: 'Department',
  plural: 'departments',
  path: '/structure/departments',
  icon: Layers,
  empty: 'Departments own programs and can be assigned to HOD officers.',
  columns: (s) => [
    {
      key: 'name',
      header: 'Department',
      primary: true,
      cell: (d) => <span className="text-ink font-semibold">{d.name}</span>,
    },
    { key: 'code', header: 'Code', cell: (d) => d.code },
    { key: 'faculty', header: 'Faculty', cell: (d) => s.faculties.find((f) => f._id === d.facultyId)?.name ?? '-' },
    {
      key: 'campuses',
      header: 'Campuses',
      cell: (d) => d.campusIds.map((c) => s.campuses.find((x) => x._id === c)?.code).join(', '),
    },
  ],
  initial: (r) => ({
    name: r?.name ?? '',
    code: r?.code ?? '',
    facultyId: r?.facultyId ?? '',
    campusIds: r?.campusIds ?? [],
  }),
  fields: (v, set, e, s) => (
    <>
      <Field label="Name" htmlFor="f-name" required error={e.name}>
        <Input
          placeholder="e.g. Department of Computer Science"
          id="f-name"
          value={v.name as string}
          onChange={(x) => set('name', x.target.value)}
        />
      </Field>
      <Field label="Code" htmlFor="f-code" required error={e.code}>
        <Input
          placeholder="e.g. CS"
          id="f-code"
          className="uppercase"
          value={v.code as string}
          onChange={(x) => set('code', x.target.value)}
        />
      </Field>
      <Field label="Faculty" htmlFor="f-fac" required error={e.facultyId} className="sm:col-span-2">
        <Select id="f-fac" value={v.facultyId as string} onChange={(x) => set('facultyId', x.target.value)}>
          <option value="">Select faculty</option>
          {s.faculties.map((f) => (
            <option key={f._id} value={f._id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-ink text-[13px] font-semibold">
          Campuses <span className="text-red-500">*</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {s.campuses.map((c) => {
            const ids = v.campusIds as string[];
            return (
              <Checkbox
                key={c._id}
                label={c.name}
                checked={ids.includes(c._id)}
                onChange={(x) => set('campusIds', x.target.checked ? [...ids, c._id] : ids.filter((i) => i !== c._id))}
              />
            );
          })}
        </div>
        {e.campusIds && <p className="mt-1 text-[12px] font-medium text-red-700 dark:text-red-400">{e.campusIds}</p>}
      </fieldset>
    </>
  ),
};

const sessionCfg: EntityConfig<AcademicSession> = {
  title: 'Academic session',
  plural: 'sessions',
  path: '/structure/sessions',
  icon: CalendarDays,
  empty: 'Add the academic session, for example 2026-2027. Campaigns belong to a session.',
  columns: () => [
    {
      key: 'name',
      header: 'Session',
      primary: true,
      cell: (s) => (
        <span className="text-ink font-semibold">
          {s.name} {s.isCurrent && <Badge tone="green">Current</Badge>}
        </span>
      ),
    },
    { key: 'start', header: 'Starts', cell: (s) => formatDate(s.startDate) },
    { key: 'end', header: 'Ends', cell: (s) => formatDate(s.endDate) },
  ],
  initial: (r) => ({
    name: r?.name ?? '',
    startDate: toDateInput(r?.startDate),
    endDate: toDateInput(r?.endDate),
    isCurrent: r?.isCurrent ?? false,
  }),
  fields: (v, set, e) => (
    <>
      <Field
        label="Name"
        htmlFor="f-name"
        required
        error={e.name}
        className="sm:col-span-2"
        hint="For example 2026-2027"
      >
        <Input
          placeholder="e.g. 2026-2027"
          id="f-name"
          value={v.name as string}
          onChange={(x) => set('name', x.target.value)}
        />
      </Field>
      <Field label="Start date" htmlFor="f-start" required error={e.startDate}>
        <Input
          placeholder="Start date"
          id="f-start"
          type="date"
          value={v.startDate as string}
          onChange={(x) => set('startDate', x.target.value)}
        />
      </Field>
      <Field label="End date" htmlFor="f-end" required error={e.endDate}>
        <Input
          placeholder="End date"
          id="f-end"
          type="date"
          value={v.endDate as string}
          onChange={(x) => set('endDate', x.target.value)}
        />
      </Field>
      <Checkbox
        className="sm:col-span-2"
        label="Current session"
        description="Only one session can be current."
        checked={v.isCurrent as boolean}
        onChange={(x) => set('isCurrent', x.target.checked)}
      />
    </>
  ),
};

function EntitySection<T extends { _id: string }>({
  cfg,
  rows,
  structure,
}: {
  cfg: EntityConfig<T>;
  rows: T[];
  structure: Structure;
}) {
  const qc = useQueryClient();
  const key = useInstKey();
  const { can } = useAuth();
  const manage = can('structure.manage');
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<T | null>(null);

  const open = (row: T | 'new') => {
    setEditing(row);
    setValues(cfg.initial(row === 'new' ? undefined : row));
    setErrors({});
  };
  const save = useMutation({
    mutationFn: () =>
      editing && editing !== 'new' ? patch(`${cfg.path}/${editing._id}`, values) : post(cfg.path, values),
    onSuccess: () => {
      toast.success(`${cfg.title} saved.`);
      qc.invalidateQueries({ queryKey: key() });
      setEditing(null);
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: (row: T) => del(`${cfg.path}/${row._id}`),
    onSuccess: () => {
      toast.success(`${cfg.title} deleted.`);
      qc.invalidateQueries({ queryKey: key() });
      setDeleting(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      setDeleting(null);
    },
  });

  const columns: Column<T>[] = [
    ...cfg.columns(structure),
    ...(manage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (r: T) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => open(r)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleting(r)}>
                  <Trash2 className="size-4 text-red-700 dark:text-red-400" />
                </Button>
              </div>
            ),
          } satisfies Column<T>,
        ]
      : []),
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <p className="text-muted text-[13px]">
          {rows.length} {rows.length === 1 ? cfg.title.toLowerCase() : cfg.plural}
        </p>
        {manage && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => open('new')}>
            Add {cfg.title.toLowerCase()}
          </Button>
        )}
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r._id}
        columns={columns}
        empty={<EmptyState icon={cfg.icon} title={`No ${cfg.title.toLowerCase()} yet`} text={cfg.empty} />}
      />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `Add ${cfg.title.toLowerCase()}` : `Edit ${cfg.title.toLowerCase()}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {editing !== null &&
            cfg.fields(values, (k, val) => setValues((v) => ({ ...v, [k]: val })), errors, structure)}
        </form>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${cfg.title.toLowerCase()}`}
        message="Records that are used by other records cannot be deleted (PROG-4)."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}

export function StructurePage() {
  const s = useStructure();
  const [tab, setTab] = useState<Tab>('campuses');
  if (!s.data) return <FullPageLoader />;
  const d = s.data;
  return (
    <>
      <PageHeader
        title="Academic structure"
        subtitle="PROG-1: campuses, faculties, departments and academic sessions"
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'campuses', label: 'Campuses', count: d.campuses.length },
          { value: 'faculties', label: 'Faculties', count: d.faculties.length },
          { value: 'departments', label: 'Departments', count: d.departments.length },
          { value: 'sessions', label: 'Sessions', count: d.sessions.length },
        ]}
      />
      {tab === 'campuses' && <EntitySection key="campuses" cfg={campusCfg} rows={d.campuses} structure={d} />}
      {tab === 'faculties' && <EntitySection key="faculties" cfg={facultyCfg} rows={d.faculties} structure={d} />}
      {tab === 'departments' && (
        <EntitySection key="departments" cfg={departmentCfg} rows={d.departments} structure={d} />
      )}
      {tab === 'sessions' && <EntitySection key="sessions" cfg={sessionCfg} rows={d.sessions} structure={d} />}
    </>
  );
}
