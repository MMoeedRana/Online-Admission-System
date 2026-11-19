'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { errorMessage, fieldErrors, get, post, put } from '@/lib/api';
import { LEVEL_LABELS, type AcademicRecord, type Subject } from './types';

const DEFAULT_SUBJECTS: Record<string, Subject[]> = {
  MATRIC: [
    'English',
    'Urdu',
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Islamic Studies',
    'Pakistan Studies',
  ].map((n, i) => ({ name: n, obtained: 0, total: i < 6 ? 150 : 100 })),
  INTERMEDIATE: ['English', 'Urdu', 'Islamic Studies', 'Pakistan Studies', 'Mathematics', 'Physics', 'Chemistry'].map(
    (n) => ({ name: n, obtained: 0, total: n === 'Islamic Studies' || n === 'Pakistan Studies' ? 50 : 200 }),
  ),
};

export function RecordModal({
  record,
  existing,
  onClose,
  onSaved,
}: {
  record: AcademicRecord | null;
  existing: AcademicRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = useQuery({
    queryKey: ['me', 'record-options'],
    queryFn: () => get<{ boards: string[] }>('/me/records/options'),
  });
  const freeLevels = Object.keys(LEVEL_LABELS).filter(
    (l) => l === 'ENTRY_TEST' || !existing.some((r) => r.level === l),
  );
  const [v, setV] = useState(() =>
    record
      ? { ...record, subjects: record.subjects.map((s) => ({ ...s })) }
      : {
          level: freeLevels[0] ?? 'MATRIC',
          board: '',
          examType: 'ANNUAL',
          testName: '',
          group: '',
          year: new Date().getFullYear() - 1,
          rollNo: '',
          registrationNo: '',
          studentName: '',
          fatherName: '',
          subjects: DEFAULT_SUBJECTS[freeLevels[0] ?? 'MATRIC'] ?? [],
          obtained: 0,
          total: 0,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));
  const sumObtained = v.subjects.reduce((a, s) => a + Number(s.obtained || 0), 0);
  const sumTotal = v.subjects.reduce((a, s) => a + Number(s.total || 0), 0);
  const isTest = v.level === 'ENTRY_TEST';
  const verified = record && (record.locked || record.trustLevel >= 2);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...v,
        year: Number(v.year),
        obtained: isTest ? Number(v.obtained) : sumObtained,
        total: isTest ? Number(v.total) : sumTotal,
        subjects: isTest ? [] : v.subjects.map((s) => ({ ...s, obtained: Number(s.obtained), total: Number(s.total) })),
      };
      return record
        ? put<AcademicRecord>(`/me/records/${record._id}`, body)
        : post<AcademicRecord>('/me/records', body);
    },
    onSuccess: (r) => {
      const msg: Record<string, string> = {
        AUTO_VERIFIED: 'Saved and verified with the board result.',
        UNDER_VERIFICATION: 'Saved. Your roll number is not in the board result yet; please upload your result card.',
        MISMATCH: 'Saved, but your marks do not match the official result. Please check them.',
      };
      toast.success(msg[r.verificationStatus] ?? 'Saved.');
      onSaved();
      onClose();
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={record ? 'Edit result' : 'Add result'}
      description="Enter the marks exactly as written on your result card. The percentage is calculated for you."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {verified ? 'Save as new version' : 'Save result'}
          </Button>
        </>
      }
    >
      {verified && (
        <Alert tone="warning" className="mb-4">
          This result is verified. Saving changes creates a new version at trust level 0 that must be verified again
          (MARK-8).
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Qualification" htmlFor="r-level" required error={errors.level}>
          <Select
            id="r-level"
            value={v.level}
            disabled={Boolean(record)}
            onChange={(e) => {
              set('level', e.target.value);
              if (!record) set('subjects', DEFAULT_SUBJECTS[e.target.value] ?? []);
            }}
          >
            {(record ? [record.level] : freeLevels).map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={isTest ? 'Conducted by' : 'Board / university'}
          htmlFor="r-board"
          required
          error={errors.board}
          className="lg:col-span-2"
        >
          {isTest ? (
            <Input
              id="r-board"
              value={v.board}
              onChange={(e) => set('board', e.target.value)}
              placeholder="e.g. CVU Entry Test"
            />
          ) : (
            <Select id="r-board" value={v.board} onChange={(e) => set('board', e.target.value)}>
              <option value="">Select board</option>
              {options.data?.boards.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Year" htmlFor="r-year" required error={errors.year}>
          <Input id="r-year" type="number" value={v.year} onChange={(e) => set('year', e.target.value)} />
        </Field>
        {isTest && (
          <Field label="Test name" htmlFor="r-test" required error={errors.testName} className="sm:col-span-2">
            <Input
              id="r-test"
              value={v.testName}
              onChange={(e) => set('testName', e.target.value)}
              placeholder="University Entry Test"
            />
          </Field>
        )}
        <Field label="Exam type" htmlFor="r-type">
          <Select id="r-type" value={v.examType} onChange={(e) => set('examType', e.target.value)}>
            <option value="ANNUAL">Annual</option>
            <option value="SUPPLEMENTARY">Supplementary</option>
            <option value="SEMESTER">Semester</option>
            <option value="TEST">Test</option>
          </Select>
        </Field>
        {!isTest && (
          <Field label="Group" htmlFor="r-group" hint="e.g. Science, ICS, Pre-Engineering">
            <Input id="r-group" value={v.group} onChange={(e) => set('group', e.target.value)} />
          </Field>
        )}
        <Field label="Roll number" htmlFor="r-roll" required error={errors.rollNo}>
          <Input id="r-roll" value={v.rollNo} onChange={(e) => set('rollNo', e.target.value)} />
        </Field>
        <Field label="Registration no. (optional)" htmlFor="r-reg">
          <Input id="r-reg" value={v.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} />
        </Field>
        <Field
          label="Name on result card"
          htmlFor="r-name"
          required
          error={errors.studentName}
          className="sm:col-span-2"
        >
          <Input id="r-name" value={v.studentName} onChange={(e) => set('studentName', e.target.value)} />
        </Field>
        <Field
          label="Father's name on result card"
          htmlFor="r-father"
          required
          error={errors.fatherName}
          className="sm:col-span-2"
        >
          <Input id="r-father" value={v.fatherName} onChange={(e) => set('fatherName', e.target.value)} />
        </Field>
      </div>

      {isTest ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Marks obtained" htmlFor="r-ob" required error={errors.obtained}>
            <Input id="r-ob" type="number" value={v.obtained} onChange={(e) => set('obtained', e.target.value)} />
          </Field>
          <Field label="Total marks" htmlFor="r-tot" required error={errors.total}>
            <Input id="r-tot" type="number" value={v.total} onChange={(e) => set('total', e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-ink text-[13.5px] font-bold">Subject-wise marks</p>
            <Button
              size="sm"
              variant="soft"
              icon={<Plus className="size-4" />}
              onClick={() => set('subjects', [...v.subjects, { name: '', obtained: 0, total: 100 }])}
            >
              Add subject
            </Button>
          </div>
          {errors.subjects && <p className="mt-1 text-[12px] font-medium text-red-600">{errors.subjects}</p>}
          <div className="mt-3 space-y-2">
            {v.subjects.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_90px_auto] items-start gap-2">
                <Input
                  aria-label="Subject"
                  value={s.name}
                  placeholder="Subject"
                  onChange={(e) =>
                    set(
                      'subjects',
                      v.subjects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  aria-label="Obtained"
                  type="number"
                  min={0}
                  value={s.obtained}
                  aria-invalid={Boolean(errors[`subjects.${i}.obtained`])}
                  onChange={(e) =>
                    set(
                      'subjects',
                      v.subjects.map((x, j) => (j === i ? { ...x, obtained: e.target.value as unknown as number } : x)),
                    )
                  }
                />
                <Input
                  aria-label="Total"
                  type="number"
                  min={1}
                  value={s.total}
                  onChange={(e) =>
                    set(
                      'subjects',
                      v.subjects.map((x, j) => (j === i ? { ...x, total: e.target.value as unknown as number } : x)),
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove subject"
                  onClick={() =>
                    set(
                      'subjects',
                      v.subjects.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="bg-card-soft mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-[13.5px]">
            <span>
              Total: <b className="text-ink">{sumObtained}</b> / <b className="text-ink">{sumTotal}</b>
            </span>
            <span className="text-primary font-semibold">
              {sumTotal > 0 ? ((sumObtained / sumTotal) * 100).toFixed(2) : '0.00'}%
            </span>
          </div>
          {(errors.obtained || errors.total) && (
            <p className="mt-1 text-[12px] font-medium text-red-600">{errors.obtained ?? errors.total}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
