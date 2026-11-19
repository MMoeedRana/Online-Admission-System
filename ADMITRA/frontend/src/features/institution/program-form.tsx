'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { DEGREE_LEVELS, QUALIFICATION_LEVELS, SHIFTS } from '@/lib/constants';
import { handleFormError } from '@/lib/forms';
import type { Program } from '@/lib/types';
import { useInstKey, useStructure } from './hooks';

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const schema = z
  .object({
    title: z.string().trim().min(3, 'Enter the program title.'),
    code: z
      .string()
      .trim()
      .min(2, 'At least 2 characters.')
      .max(15)
      .regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and -'),
    degreeLevel: z.enum(Object.keys(DEGREE_LEVELS) as [string, ...string[]]),
    fieldGroup: z.string().trim().max(60),
    durationYears: z.coerce.number().int().min(1).max(8),
    description: z.string().trim().max(2000),
    departmentId: z.string().min(1, 'Select a department.'),
    campusId: z.string().min(1, 'Select a campus.'),
    shifts: z
      .array(
        z.object({
          name: z.enum(['MORNING', 'EVENING', 'WEEKEND']),
          seats: z.coerce.number().int().min(1, 'At least 1 seat.'),
        }),
      )
      .min(1, 'Add at least one shift.')
      .refine((s) => new Set(s.map((x) => x.name)).size === s.length, 'Each shift can be added only once.'),
    eligibility: z.array(
      z.object({
        level: z.string(),
        minPercentage: z.coerce.number().min(0).max(100),
        groups: z.string(),
        subjects: z.string(),
      }),
    ),
    testRequired: z.boolean(),
    testName: z.string().trim().max(80),
    applicationFee: z.coerce.number().min(0, 'Cannot be negative.'),
    admissionFee: z.coerce.number().min(0, 'Cannot be negative.'),
  })
  .refine((v) => !v.testRequired || v.testName.length > 0, {
    message: 'Enter the name of the entry test.',
    path: ['testName'],
  });

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

function toValues(p?: Program): Values {
  if (!p) {
    return {
      title: '',
      code: '',
      degreeLevel: 'BS',
      fieldGroup: '',
      durationYears: 4,
      description: '',
      departmentId: '',
      campusId: '',
      shifts: [{ name: 'MORNING', seats: 60 }],
      eligibility: [
        { level: 'MATRIC', minPercentage: 45, groups: '', subjects: '' },
        { level: 'INTERMEDIATE', minPercentage: 50, groups: '', subjects: '' },
      ],
      testRequired: false,
      testName: '',
      applicationFee: 2000,
      admissionFee: 50000,
    };
  }
  return {
    ...p,
    departmentId: typeof p.departmentId === 'object' ? p.departmentId._id : p.departmentId,
    campusId: typeof p.campusId === 'object' ? p.campusId._id : p.campusId,
    shifts: p.shifts as Values['shifts'],
    eligibility: p.eligibility.map((e) => ({ ...e, groups: e.groups.join(', '), subjects: e.subjects.join(', ') })),
  };
}

function toPayload(v: Parsed) {
  return {
    ...v,
    eligibility: v.eligibility.map((e) => ({ ...e, groups: list(e.groups), subjects: list(e.subjects) })),
  };
}

export function ProgramEditor({ id }: { id?: string }) {
  const key = useInstKey();
  const q = useQuery({
    queryKey: key('program', id),
    queryFn: () => get<Program>(`/programs/${id}`),
    enabled: Boolean(id),
  });
  if (id && !q.data) return <FullPageLoader />;
  return <ProgramForm program={q.data} />;
}

function ProgramForm({ program }: { program?: Program }) {
  const router = useRouter();
  const qc = useQueryClient();
  const key = useInstKey();
  const { can } = useAuth();
  const structure = useStructure();
  const editable = can('programs.manage');
  const [confirm, setConfirm] = useState<'delete' | 'archive' | null>(null);
  const [initial] = useState(() => toValues(program));
  const form = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: initial });
  const { register, handleSubmit, control, setError, formState } = form;
  const shifts = useFieldArray({ control, name: 'shifts' });
  const elig = useFieldArray({ control, name: 'eligibility' });
  const e = formState.errors;
  const testRequired = useWatch({ control, name: 'testRequired' });

  const statusMut = useMutation({
    mutationFn: (status: 'ACTIVE' | 'ARCHIVED') => post<Program>(`/programs/${program!._id}/status`, { status }),
    onSuccess: (p) => {
      toast.success(p.status === 'ARCHIVED' ? 'Program archived.' : 'Program restored.');
      qc.invalidateQueries({ queryKey: key() });
      setConfirm(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const delMut = useMutation({
    mutationFn: () => del(`/programs/${program!._id}`),
    onSuccess: () => {
      toast.success('Program deleted.');
      qc.invalidateQueries({ queryKey: key() });
      router.replace('/institution/programs');
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      setConfirm(null);
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const payload = toPayload(v);
      const saved = program
        ? await patch<Program>(`/programs/${program._id}`, payload)
        : await post<Program>('/programs', payload);
      toast.success(program ? 'Program saved.' : 'Program added.');
      qc.invalidateQueries({ queryKey: key() });
      if (!program) router.replace(`/institution/programs/${saved._id}`);
    } catch (err) {
      handleFormError(err, setError);
    }
  });

  const st = structure.data;
  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Programs', href: '/institution/programs' },
          { label: program ? program.code : 'New program' },
        ]}
        title={
          program ? (
            <span className="flex flex-wrap items-center gap-3">
              {program.title} <StatusBadge status={program.status} />
            </span>
          ) : (
            'Add program'
          )
        }
        subtitle="PROG-2: shifts with seats, eligibility per qualification, entry test and fees"
        actions={
          program && editable ? (
            <>
              {program.status === 'ACTIVE' ? (
                <Button variant="secondary" icon={<Archive className="size-4" />} onClick={() => setConfirm('archive')}>
                  Archive
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={<ArchiveRestore className="size-4" />}
                  loading={statusMut.isPending}
                  onClick={() => statusMut.mutate('ACTIVE')}
                >
                  Restore
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<Trash2 className="size-4 text-red-600" />}
                onClick={() => setConfirm('delete')}
              >
                Delete
              </Button>
            </>
          ) : undefined
        }
      />
      {st && (st.departments.length === 0 || st.campuses.length === 0) && (
        <Alert tone="warning" title="Academic structure needed" className="mb-6">
          Add at least one campus and one department in Academic Structure before adding programs.
        </Alert>
      )}
      <form noValidate onSubmit={onSubmit} className="space-y-6">
        <fieldset disabled={!editable} className="space-y-6">
          <Card>
            <CardHeader title="Program details" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Title" htmlFor="title" required error={e.title?.message} className="sm:col-span-2">
                <Input id="title" placeholder="BS Computer Science" {...register('title')} />
              </Field>
              <Field label="Code" htmlFor="code" required error={e.code?.message} hint="Unique in your institution">
                <Input id="code" className="uppercase" {...register('code')} />
              </Field>
              <Field label="Degree level" htmlFor="degreeLevel" required>
                <Select id="degreeLevel" {...register('degreeLevel')}>
                  {Object.entries(DEGREE_LEVELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Department"
                htmlFor="departmentId"
                required
                error={e.departmentId?.message}
                className="sm:col-span-2"
              >
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <Select id="departmentId" {...field}>
                      <option value="">Select department</option>
                      {st?.departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
              <Field label="Campus" htmlFor="campusId" required error={e.campusId?.message}>
                <Controller
                  control={control}
                  name="campusId"
                  render={({ field }) => (
                    <Select id="campusId" {...field}>
                      <option value="">Select campus</option>
                      {st?.campuses.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </Field>
              <Field label="Duration (years)" htmlFor="durationYears" error={e.durationYears?.message}>
                <Input id="durationYears" type="number" min={1} max={8} {...register('durationYears')} />
              </Field>
              <Field
                label="Field group"
                htmlFor="fieldGroup"
                hint="For example Computing, Engineering"
                className="sm:col-span-2"
              >
                <Input id="fieldGroup" {...register('fieldGroup')} />
              </Field>
              <Field label="Description" htmlFor="description" className="sm:col-span-2 lg:col-span-4">
                <Textarea id="description" {...register('description')} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Shifts and seats"
              action={
                <Button
                  size="sm"
                  variant="soft"
                  icon={<Plus className="size-4" />}
                  onClick={() => shifts.append({ name: 'EVENING', seats: 30 })}
                  disabled={shifts.fields.length >= 3}
                >
                  Add shift
                </Button>
              }
            />
            <CardBody className="space-y-3">
              {shifts.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  <Field label="Shift" htmlFor={`sh-${i}`}>
                    <Select id={`sh-${i}`} {...register(`shifts.${i}.name`)}>
                      {Object.entries(SHIFTS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Seats" htmlFor={`se-${i}`} error={e.shifts?.[i]?.seats?.message}>
                    <Input id={`se-${i}`} type="number" min={1} {...register(`shifts.${i}.seats`)} />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove shift"
                    onClick={() => shifts.remove(i)}
                    disabled={shifts.fields.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {(e.shifts?.message || e.shifts?.root?.message) && (
                <p className="text-[12px] font-medium text-red-600">{e.shifts?.message ?? e.shifts?.root?.message}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Eligibility"
              subtitle="Minimum percentage for each qualification; groups and subjects are separated by commas"
              action={
                <Button
                  size="sm"
                  variant="soft"
                  icon={<Plus className="size-4" />}
                  onClick={() => elig.append({ level: 'INTERMEDIATE', minPercentage: 50, groups: '', subjects: '' })}
                >
                  Add rule
                </Button>
              }
            />
            <CardBody className="space-y-4">
              {elig.fields.length === 0 && (
                <p className="text-muted text-[13px]">No eligibility rules. Every applicant can apply.</p>
              )}
              {elig.fields.map((f, i) => (
                <div
                  key={f.id}
                  className="border-line grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.7fr_1.5fr_1.5fr_auto] lg:items-end"
                >
                  <Field label="Qualification" htmlFor={`el-${i}`}>
                    <Select id={`el-${i}`} {...register(`eligibility.${i}.level`)}>
                      {Object.entries(QUALIFICATION_LEVELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Minimum %" htmlFor={`em-${i}`} error={e.eligibility?.[i]?.minPercentage?.message}>
                    <Input
                      id={`em-${i}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      {...register(`eligibility.${i}.minPercentage`)}
                    />
                  </Field>
                  <Field label="Required groups" htmlFor={`eg-${i}`}>
                    <Input id={`eg-${i}`} placeholder="Pre-Engineering, ICS" {...register(`eligibility.${i}.groups`)} />
                  </Field>
                  <Field label="Required subjects" htmlFor={`es-${i}`}>
                    <Input id={`es-${i}`} placeholder="Mathematics" {...register(`eligibility.${i}.subjects`)} />
                  </Field>
                  <Button variant="ghost" size="icon" aria-label="Remove rule" onClick={() => elig.remove(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
                <Checkbox
                  label="Entry test required"
                  description="The test result becomes part of the merit."
                  {...register('testRequired')}
                />
                {testRequired && (
                  <Field label="Entry test name" htmlFor="testName" required error={e.testName?.message}>
                    <Input
                      id="testName"
                      placeholder="University Entry Test, ECAT, MDCAT..."
                      {...register('testName')}
                    />
                  </Field>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Fees" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Application fee (Rs.)" htmlFor="applicationFee" required error={e.applicationFee?.message}>
                <Input id="applicationFee" type="number" min={0} {...register('applicationFee')} />
              </Field>
              <Field label="Admission fee (Rs.)" htmlFor="admissionFee" required error={e.admissionFee?.message}>
                <Input id="admissionFee" type="number" min={0} {...register('admissionFee')} />
              </Field>
            </CardBody>
          </Card>
        </fieldset>
        {editable && (
          <div className="border-line bg-card/95 sticky bottom-3 z-10 flex justify-end gap-2 rounded-2xl border p-3 shadow-[var(--shadow-pop)] backdrop-blur">
            <Button variant="secondary" onClick={() => router.push('/institution/programs')}>
              Cancel
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {program ? 'Save changes' : 'Add program'}
            </Button>
          </div>
        )}
      </form>
      <ConfirmDialog
        open={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        title="Archive program"
        message="Archived programs are hidden from new campaigns and from the public website. Existing records are kept."
        confirmLabel="Archive"
        variant="primary"
        loading={statusMut.isPending}
        onConfirm={() => statusMut.mutate('ARCHIVED')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete program"
        message="Only programs that were never used in a campaign can be deleted (PROG-4). Otherwise archive the program."
        confirmLabel="Delete"
        loading={delMut.isPending}
        onConfirm={() => delMut.mutate()}
      />
    </>
  );
}
