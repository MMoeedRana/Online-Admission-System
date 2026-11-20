'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { errorMessage, fieldErrors, post } from '@/lib/api';
import { SHIFTS } from '@/lib/constants';

export function HistoryForm({
  url,
  programs,
  programId,
  onClose,
  onSaved,
}: {
  url: string;
  programs: { _id: string; title: string }[];
  programId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const year = new Date().getFullYear();
  const [v, setV] = useState({
    directoryProgramId: programId ?? programs[0]?._id ?? '',
    year: String(year - 1),
    round: '1',
    shift: 'MORNING',
    quota: 'OPEN',
    openingMerit: '',
    closingMerit: '',
    seats: '',
    source: '',
    sourceUrl: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      post(url, {
        ...v,
        year: Number(v.year),
        round: Number(v.round),
        openingMerit: v.openingMerit === '' ? null : Number(v.openingMerit),
        closingMerit: Number(v.closingMerit),
        seats: v.seats === '' ? null : Number(v.seats),
      }),
    onSuccess: () => {
      toast.success('Saved as draft. It is used after the super admin verifies the source.');
      onSaved();
      onClose();
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add merit history"
      description="Copy the figures exactly from the published merit list and give its source."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save as draft
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Program" htmlFor="h-prog" className="sm:col-span-3" required error={errors.directoryProgramId}>
          <Select id="h-prog" value={v.directoryProgramId} onChange={(e) => set('directoryProgramId', e.target.value)}>
            {programs.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year" htmlFor="h-year" required error={errors.year}>
          <Input
            placeholder="e.g. 2025"
            id="h-year"
            inputMode="numeric"
            value={v.year}
            onChange={(e) => set('year', e.target.value)}
          />
        </Field>
        <Field label="Merit list (round)" htmlFor="h-round" required error={errors.round}>
          <Input
            placeholder="e.g. 1"
            id="h-round"
            inputMode="numeric"
            value={v.round}
            onChange={(e) => set('round', e.target.value)}
          />
        </Field>
        <Field label="Shift" htmlFor="h-shift">
          <Select id="h-shift" value={v.shift} onChange={(e) => set('shift', e.target.value)}>
            {Object.entries(SHIFTS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quota" htmlFor="h-quota" error={errors.quota}>
          <Input
            placeholder="e.g. Open merit"
            id="h-quota"
            value={v.quota}
            onChange={(e) => set('quota', e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Opening merit" htmlFor="h-open" error={errors.openingMerit}>
          <Input
            placeholder="e.g. 92.10"
            id="h-open"
            inputMode="decimal"
            value={v.openingMerit}
            onChange={(e) => set('openingMerit', e.target.value)}
          />
        </Field>
        <Field label="Closing merit" htmlFor="h-close" required error={errors.closingMerit}>
          <Input
            placeholder="e.g. 84.35"
            id="h-close"
            inputMode="decimal"
            value={v.closingMerit}
            onChange={(e) => set('closingMerit', e.target.value)}
          />
        </Field>
        <Field label="Seats" htmlFor="h-seats" error={errors.seats}>
          <Input
            placeholder="e.g. 60"
            id="h-seats"
            inputMode="numeric"
            value={v.seats}
            onChange={(e) => set('seats', e.target.value)}
          />
        </Field>
        <Field label="Source" htmlFor="h-src" className="sm:col-span-2" required error={errors.source}>
          <Input
            id="h-src"
            placeholder="e.g. Second merit list 2025, notice board"
            value={v.source}
            onChange={(e) => set('source', e.target.value)}
          />
        </Field>
        <Field label="Source link" htmlFor="h-url" className="sm:col-span-3" error={errors.sourceUrl}>
          <Input
            id="h-url"
            placeholder="https://"
            value={v.sourceUrl}
            onChange={(e) => set('sourceUrl', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
