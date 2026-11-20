'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  CheckCircle2,
  CopyPlus,
  Lock,
  Pencil,
  Plus,
  Sigma,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { FullPageLoader } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { useInstKey } from '@/features/institution/hooks';
import { api, del, errorMessage, patch, post } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CampaignPicker, useCampaign } from './campaign-picker';

export interface Component {
  type: string;
  testName: string;
  weight: number;
  minPercentage: number | null;
  required: boolean;
}
interface Formula {
  _id: string;
  version: number;
  components: Component[];
  tieBreakers: string[];
  note: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  createdByName: string;
  activatedAt?: string;
  createdAt: string;
}
interface Row {
  program: { _id: string; title: string; code: string; degreeLevel: string; testRequired: boolean; testName: string };
  active: Formula | null;
  versions: Formula[];
}

export const COMPONENTS: Record<string, string> = {
  MATRIC: 'Matric / O-Level',
  INTERMEDIATE: 'Intermediate / A-Level',
  BACHELOR_14: "Bachelor's (14 years)",
  BACHELOR_16: "Bachelor's (16 years)",
  MASTER: "Master's",
  ENTRY_TEST: 'Entry test',
};
const TIE: Record<string, string> = {
  ENTRY_TEST: 'Higher entry test',
  INTERMEDIATE: 'Higher Intermediate',
  MATRIC: 'Higher Matric',
  BACHELOR: "Higher Bachelor's",
  YOUNGER: 'Younger applicant',
};
const COLORS = ['bg-[#1F6FEB]', 'bg-[#16A34A]', 'bg-[#D97706]', 'bg-[#7C3AED]', 'bg-[#0EA5E9]', 'bg-[#DB2777]'];

/** MERIT-1, MERIT-2 and the test mode of Table 3.13. */
export function MeritFormulas() {
  const { campaigns, campaign, id, select, loading } = useCampaign();
  const key = useInstKey();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can('merit.manage');
  const [edit, setEdit] = useState<{
    programId: string;
    title: string;
    formula: Formula | null;
    base?: Formula | null;
  } | null>(null);
  const [test, setTest] = useState<{ title: string; components: Component[] } | null>(null);
  const [remove, setRemove] = useState<Formula | null>(null);
  const q = useQuery({
    queryKey: key('formulas', id),
    queryFn: async () => (await api.get<{ data: Row[] }>('/merit-formulas', { params: { campaignId: id } })).data.data,
    enabled: Boolean(id),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key('formulas') });
  const activate = useMutation({
    mutationFn: (f: Formula) => post(`/merit-formulas/${f._id}/activate`),
    onSuccess: () => (toast.success('Formula activated and locked.'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const newVersion = useMutation({
    mutationFn: (f: Formula) => post<Formula>(`/merit-formulas/${f._id}/new-version`),
    onSuccess: () => (toast.success('A new draft version was created.'), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (loading) return <FullPageLoader />;
  return (
    <>
      <PageHeader
        title="Merit Formulas"
        subtitle="Each program has its own versioned formula. Active versions are locked; changes create a new version."
        actions={campaigns.length ? <CampaignPicker value={id} campaigns={campaigns} onChange={select} /> : undefined}
      />
      {!campaign ? (
        <Card>
          <EmptyState
            icon={Sigma}
            title="No admission campaign yet"
            text="Formulas are defined per program of a campaign."
          />
        </Card>
      ) : !q.data ? (
        <FullPageLoader />
      ) : (
        <Stagger className="grid gap-5 xl:grid-cols-2" gap={0.05}>
          {q.data.map((row) => {
            const draft = row.versions.find((v) => v.status === 'DRAFT');
            const shown = row.active ?? draft;
            return (
              <StaggerItem key={row.program._id} className="h-full">
                <Card className="flex h-full flex-col p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-ink text-[16px] font-bold">{row.program.title}</p>
                      <p className="text-muted text-[12.5px]">
                        {row.program.code}
                        {row.program.testRequired ? ` · ${row.program.testName || 'entry test required'}` : ''}
                      </p>
                    </div>
                    {row.active ? (
                      <Badge tone="green">
                        <Lock className="size-3" /> Active v{row.active.version}
                      </Badge>
                    ) : (
                      <Badge tone="amber">No active formula</Badge>
                    )}
                  </div>
                  {shown ? (
                    <>
                      <div className="mt-5 flex h-3 overflow-hidden rounded-full">
                        {shown.components.map((c, i) => (
                          <div
                            key={c.type}
                            className={cn(COLORS[i % COLORS.length], 'h-full')}
                            style={{ width: `${c.weight}%` }}
                            title={`${COMPONENTS[c.type]} ${c.weight}%`}
                          />
                        ))}
                      </div>
                      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                        {shown.components.map((c, i) => (
                          <li key={c.type} className="flex items-center gap-2 text-[13px]">
                            <span className={cn('size-2.5 rounded-full', COLORS[i % COLORS.length])} />
                            <span className="text-body">{COMPONENTS[c.type]}</span>
                            <b className="text-ink ml-auto">{c.weight}%</b>
                            {c.minPercentage != null && (
                              <span className="text-muted text-[11.5px]">min {c.minPercentage}%</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="text-muted mt-3 text-[12.5px]">
                        Ties: {shown.tieBreakers.map((t) => TIE[t]).join(', then ')}, then application number
                      </p>
                    </>
                  ) : (
                    <p className="text-muted mt-5 text-[13.5px]">
                      No formula yet. Applications for this program cannot be ranked.
                    </p>
                  )}
                  <div className="border-line mt-5 space-y-2 border-t pt-4">
                    {row.versions.map((v) => (
                      <div key={v._id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span className="text-ink font-semibold">Version {v.version}</span>
                        <Badge tone={v.status === 'ACTIVE' ? 'green' : v.status === 'DRAFT' ? 'amber' : 'gray'}>
                          {v.status.toLowerCase()}
                        </Badge>
                        <span className="text-muted">
                          {v.createdByName} · {formatDateTime(v.activatedAt ?? v.createdAt)}
                        </span>
                        {v.note && <span className="text-muted w-full pl-0.5 italic">“{v.note}”</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    {shown && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Calculator className="size-4" />}
                        onClick={() => setTest({ title: row.program.title, components: shown.components })}
                      >
                        Test
                      </Button>
                    )}
                    {canEdit && !row.versions.length && (
                      <Button
                        size="sm"
                        icon={<Plus className="size-4" />}
                        onClick={() => setEdit({ programId: row.program._id, title: row.program.title, formula: null })}
                      >
                        Create formula
                      </Button>
                    )}
                    {canEdit && draft && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Pencil className="size-4" />}
                          onClick={() =>
                            setEdit({ programId: row.program._id, title: row.program.title, formula: draft })
                          }
                        >
                          Edit draft v{draft.version}
                        </Button>
                        <Button
                          size="sm"
                          icon={<CheckCircle2 className="size-4" />}
                          loading={activate.isPending}
                          onClick={() => activate.mutate(draft)}
                        >
                          Activate v{draft.version}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="size-4 text-red-700 dark:text-red-400" />}
                          onClick={() => setRemove(draft)}
                        >
                          Delete draft
                        </Button>
                      </>
                    )}
                    {canEdit && row.active && !draft && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<CopyPlus className="size-4" />}
                        loading={newVersion.isPending}
                        onClick={() => newVersion.mutate(row.active!)}
                      >
                        New version
                      </Button>
                    )}
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
      {edit && (
        <FormulaEditor
          key={edit.formula?._id ?? edit.programId}
          edit={edit}
          campaignId={id}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
      {test && <TestPanel title={test.title} components={test.components} onClose={() => setTest(null)} />}
      <ConfirmDialog
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        title="Delete draft"
        message={`Version ${remove?.version} will be deleted.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await del(`/merit-formulas/${remove!._id}`);
            setRemove(null);
            await refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}

const DEFAULT: Component[] = [
  { type: 'MATRIC', testName: '', weight: 10, minPercentage: null, required: true },
  { type: 'INTERMEDIATE', testName: '', weight: 40, minPercentage: null, required: true },
  { type: 'ENTRY_TEST', testName: '', weight: 50, minPercentage: null, required: true },
];

function FormulaEditor({
  edit,
  campaignId,
  onClose,
  onSaved,
}: {
  edit: { programId: string; title: string; formula: Formula | null };
  campaignId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [components, setComponents] = useState<Component[]>(edit.formula?.components.map((c) => ({ ...c })) ?? DEFAULT);
  const [ties, setTies] = useState<string[]>(edit.formula?.tieBreakers ?? ['ENTRY_TEST', 'INTERMEDIATE', 'YOUNGER']);
  const [note, setNote] = useState(edit.formula?.note ?? '');
  const total = Math.round(components.reduce((s, c) => s + (Number(c.weight) || 0), 0) * 100) / 100;
  const save = useMutation({
    mutationFn: () => {
      const body = {
        components: components.map((c) => ({
          ...c,
          weight: Number(c.weight),
          minPercentage: c.minPercentage === null || String(c.minPercentage) === '' ? null : Number(c.minPercentage),
        })),
        tieBreakers: ties,
        note,
      };
      return edit.formula
        ? patch(`/merit-formulas/${edit.formula._id}`, body)
        : post('/merit-formulas', { ...body, campaignId, programId: edit.programId });
    },
    onSuccess: () => {
      toast.success('Formula saved as a draft. Activate it to use it.');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setC = (i: number, patchC: Partial<Component>) =>
    setComponents((cs) => cs.map((c, j) => (j === i ? { ...c, ...patchC } : c)));
  const move = (i: number, d: -1 | 1) =>
    setTies((t) => {
      const n = [...t];
      [n[i], n[i + d]] = [n[i + d]!, n[i]!];
      return n;
    });
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${edit.formula ? `Edit version ${edit.formula.version}` : 'New formula'}: ${edit.title}`}
      description="Aggregate = sum of (percentage x weight / 100). Weights must total 100."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={total !== 100} loading={save.isPending} onClick={() => save.mutate()}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {components.map((c, i) => (
          <div
            key={i}
            className="border-line grid items-end gap-3 rounded-2xl border p-3 sm:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_auto]"
          >
            <Field label="Component" htmlFor={`c-type-${i}`}>
              <Select id={`c-type-${i}`} value={c.type} onChange={(e) => setC(i, { type: e.target.value })}>
                {Object.entries(COMPONENTS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Test name"
              htmlFor={`c-test-${i}`}
              hint={c.type === 'ENTRY_TEST' ? 'Empty: any entry test' : undefined}
            >
              <Input
                placeholder="e.g. ECAT"
                id={`c-test-${i}`}
                disabled={c.type !== 'ENTRY_TEST'}
                value={c.testName}
                onChange={(e) => setC(i, { testName: e.target.value })}
              />
            </Field>
            <Field label="Weight %" htmlFor={`c-w-${i}`}>
              <Input
                placeholder="e.g. 50"
                id={`c-w-${i}`}
                inputMode="decimal"
                value={String(c.weight)}
                onChange={(e) => setC(i, { weight: e.target.value as unknown as number })}
              />
            </Field>
            <Field label="Min %" htmlFor={`c-min-${i}`}>
              <Input
                placeholder="e.g. 45"
                id={`c-min-${i}`}
                inputMode="decimal"
                value={c.minPercentage ?? ''}
                onChange={(e) =>
                  setC(i, { minPercentage: e.target.value === '' ? null : (e.target.value as unknown as number) })
                }
              />
            </Field>
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                className="border-0 p-0"
                label="Required"
                checked={c.required}
                onChange={(e) => setC(i, { required: e.target.checked })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove component"
                onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4 text-red-700 dark:text-red-400" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="size-4" />}
            disabled={components.length >= 6}
            onClick={() =>
              setComponents((cs) => [
                ...cs,
                { type: 'BACHELOR_16', testName: '', weight: 0, minPercentage: null, required: true },
              ])
            }
          >
            Add component
          </Button>
          <p
            className={cn(
              'text-[14px] font-bold',
              total === 100 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400',
            )}
          >
            Total {total}% {total === 100 ? '✓' : '(must be 100)'}
          </p>
        </div>
        <div className="border-line rounded-2xl border p-4">
          <p className="text-ink text-[13.5px] font-semibold">Tie-breakers (in order)</p>
          <ul className="mt-2 space-y-1.5">
            {ties.map((t, i) => (
              <li key={t} className="bg-card-soft flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]">
                <span className="text-muted w-5 font-bold">{i + 1}.</span> {TIE[t]}
                <span className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={i === ties.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove"
                    onClick={() => setTies(ties.filter((x) => x !== t))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.keys(TIE)
              .filter((t) => !ties.includes(t))
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTies([...ties, t])}
                  className="border-line text-body hover:border-primary rounded-lg border border-dashed px-2.5 py-1 text-[12px]"
                >
                  + {TIE[t]}
                </button>
              ))}
          </div>
          <p className="text-muted mt-2 text-[12px]">
            The application number is always the final tie-breaker (MERIT-4).
          </p>
        </div>
        <Field label="Note for the committee" htmlFor="f-note">
          <Textarea
            placeholder="What changed in this formula"
            id="f-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function TestPanel({ title, components, onClose }: { title: string; components: Component[]; onClose: () => void }) {
  const [marks, setMarks] = useState<Record<string, string>>(Object.fromEntries(components.map((c) => [c.type, ''])));
  const run = useMutation({
    mutationFn: () =>
      post<{
        ok: boolean;
        aggregate: number;
        reason?: string;
        breakdown: { label: string; percentage: number | null; weight: number; contribution: number; note?: string }[];
      }>('/merit-formulas/test', {
        components,
        marks: Object.fromEntries(
          components
            .filter((c) => marks[c.type] !== '')
            .map((c) => [
              c.type === 'ENTRY_TEST' && c.testName ? `ENTRY_TEST:${c.testName}` : c.type,
              Number(marks[c.type]),
            ]),
        ),
      }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Test the formula: ${title}`}
      description="Enter sample percentages to see the aggregate line by line."
    >
      <div className="grid grid-cols-2 gap-3">
        {components.map((c) => (
          <Field key={c.type} label={`${COMPONENTS[c.type]} %`} htmlFor={`t-${c.type}`}>
            <Input
              placeholder="e.g. 80"
              id={`t-${c.type}`}
              inputMode="decimal"
              value={marks[c.type]}
              onChange={(e) => setMarks({ ...marks, [c.type]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <Button
        className="mt-4"
        icon={<Calculator className="size-4" />}
        loading={run.isPending}
        onClick={() => run.mutate()}
      >
        Calculate
      </Button>
      {run.data && (
        <div className="bg-card-soft mt-4 rounded-2xl p-4">
          {run.data.breakdown.map((b) => (
            <p key={b.label} className="flex justify-between text-[13px]">
              <span>
                {b.label}: {b.percentage ?? '-'} x {b.weight}%
                {b.note ? <span className="text-red-700 dark:text-red-400"> ({b.note})</span> : null}
              </span>
              <b>{b.contribution.toFixed(2)}</b>
            </p>
          ))}
          <p className="border-line mt-2 flex justify-between border-t pt-2 text-[15px] font-extrabold">
            <span>Aggregate</span>
            <span className="text-primary">{run.data.aggregate.toFixed(2)}</span>
          </p>
          {!run.data.ok && (
            <p className="mt-1 text-[12.5px] text-red-700 dark:text-red-400">Would be excluded: {run.data.reason}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
