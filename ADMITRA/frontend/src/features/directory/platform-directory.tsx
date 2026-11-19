'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Compass, Plus, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { KpiCard, KpiGrid } from '@/components/ui/kpi-card';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import type { DirInstitution, DirProgram, HistoryRow } from '@/features/advisor/types';
import { api, errorMessage, fieldErrors, get, getPaged, post } from '@/lib/api';
import { DEGREE_LEVELS, INSTITUTION_TYPES, PROVINCES } from '@/lib/constants';
import { formatDateTime, formatMoney } from '@/lib/format';
import { HistoryForm } from './history-form';
import { HistoryImport } from './history-import';

type Tab = 'verify' | 'institutions' | 'import' | 'gaps' | 'claims' | 'usage';
type DraftRow = HistoryRow & {
  _id: string;
  program: string;
  institution: string;
  enteredByName: string;
  createdAt: string;
};

/** Reference directory manager (DIR-1 to DIR-8, PRED-12) for the super admin. */
export function PlatformDirectory() {
  const [tab, setTab] = useState<Tab>('verify');
  const counts = useQuery({
    queryKey: ['platform', 'directory', 'counts'],
    queryFn: async () =>
      (
        await api.get<{ meta: { counts: Record<string, number> } }>('/platform/directory/history', {
          params: { limit: 1 },
        })
      ).data.meta.counts,
  });
  const gaps = useQuery({
    queryKey: ['platform', 'directory', 'gaps-meta'],
    queryFn: async () =>
      (await api.get<{ meta: { programs: number; missing: number; year: number } }>('/platform/directory/data-gaps'))
        .data.meta,
  });
  const claims = useQuery({
    queryKey: ['platform', 'directory', 'claims'],
    queryFn: () =>
      getPaged<DirInstitution & { claim: { institutionName: string; note: string; at: string } }>(
        '/platform/directory/institutions',
        { claim: 'PENDING' },
      ),
  });
  return (
    <>
      <PageHeader
        title="Reference Directory"
        subtitle="Institutions, programs and closing merit used by the directory and the Admission Advisor"
      />
      <KpiGrid className="mb-6">
        <KpiCard
          label="Waiting for verification"
          value={counts.data?.DRAFT ?? 0}
          sub="Draft history rows"
          icon={ShieldCheck}
          tint="amber"
        />
        <KpiCard
          label="Verified history rows"
          value={counts.data?.VERIFIED ?? 0}
          sub="Used by the Admission Advisor"
          icon={CheckCircle2}
          tint="green"
        />
        <KpiCard
          label="Programs in the directory"
          value={gaps.data?.programs ?? 0}
          sub={`${gaps.data?.missing ?? 0} without ${gaps.data?.year ?? ''} data`}
          icon={BookOpen}
        />
        <KpiCard
          label="Pending claims"
          value={claims.data?.meta.total ?? 0}
          sub="Institutions claiming a listing"
          icon={Compass}
          tint="purple"
        />
      </KpiGrid>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'verify', label: 'Verification queue', count: counts.data?.DRAFT ?? 0 },
          { value: 'institutions', label: 'Institutions and programs' },
          { value: 'import', label: 'Import' },
          { value: 'gaps', label: 'Data gaps', count: gaps.data?.missing },
          { value: 'claims', label: 'Claims', count: claims.data?.meta.total ?? 0 },
          { value: 'usage', label: 'Advisor usage' },
        ]}
      />
      {tab === 'verify' && <VerifyQueue />}
      {tab === 'institutions' && <Institutions />}
      {tab === 'import' && <HistoryImport base="/platform/directory" onDone={() => void counts.refetch()} />}
      {tab === 'gaps' && <DataGaps />}
      {tab === 'claims' && <Claims rows={claims.data?.data ?? []} onDone={() => void claims.refetch()} />}
      {tab === 'usage' && <AdvisorUsage />}
    </>
  );
}

function VerifyQueue() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [reject, setReject] = useState(false);
  const list = useQuery({
    queryKey: ['platform', 'directory', 'drafts', page],
    queryFn: () => getPaged<DraftRow>('/platform/directory/history', { status: 'DRAFT', page }),
  });
  const decide = useMutation({
    mutationFn: (v: { decision: 'VERIFIED' | 'REJECTED'; reason?: string }) =>
      post<{ updated: number }>('/platform/directory/history/decision', { ids: sel, ...v }),
    onSuccess: (r, v) => {
      toast.success(`${r.updated} row(s) ${v.decision === 'VERIFIED' ? 'verified' : 'rejected'}.`);
      setSel([]);
      setReject(false);
      void qc.invalidateQueries({ queryKey: ['platform', 'directory'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = list.data?.data ?? [];
  const all = rows.length > 0 && rows.every((r) => sel.includes(r._id));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <p className="text-muted text-[13px]">
          Check each source before verifying; only verified rows are used by the Admission Advisor (DIR-4).
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!sel.length}
            icon={<XCircle className="size-4 text-red-600" />}
            onClick={() => setReject(true)}
          >
            Reject
          </Button>
          <Button
            disabled={!sel.length}
            loading={decide.isPending}
            icon={<CheckCircle2 className="size-4" />}
            onClick={() => decide.mutate({ decision: 'VERIFIED' })}
          >
            Verify {sel.length || ''}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[13.5px]">
          <thead>
            <tr className="border-line bg-card-soft text-muted border-y text-[11.5px] tracking-wider uppercase">
              <th className="px-5 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="accent-[var(--primary)]"
                  checked={all}
                  onChange={() => setSel(all ? [] : rows.map((r) => r._id))}
                />
              </th>
              <th className="px-3 py-3 font-semibold">Program</th>
              <th className="px-3 py-3 font-semibold">Year / list</th>
              <th className="px-3 py-3 font-semibold">Closing</th>
              <th className="px-3 py-3 font-semibold">Source</th>
              <th className="px-5 py-3 font-semibold">Entered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-line border-b last:border-0">
                <td className="px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    className="accent-[var(--primary)]"
                    checked={sel.includes(r._id)}
                    onChange={() => setSel(sel.includes(r._id) ? sel.filter((x) => x !== r._id) : [...sel, r._id])}
                  />
                </td>
                <td className="px-3 py-3">
                  <p className="text-ink font-semibold">{r.program}</p>
                  <p className="text-muted text-[12px]">{r.institution}</p>
                </td>
                <td className="px-3 py-3">
                  {r.year} · list {r.round} · {r.shift.toLowerCase()}
                </td>
                <td className="text-ink px-3 py-3 font-semibold tabular-nums">{r.closingMerit.toFixed(2)}</td>
                <td className="max-w-xs px-3 py-3">
                  <p className="truncate text-[12.5px]">{r.source}</p>
                  {r.sourceUrl && (
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-[12px] font-semibold"
                    >
                      Open source
                    </a>
                  )}
                </td>
                <td className="text-muted px-5 py-3 text-[12px]">
                  {r.enteredByName} · {formatDateTime(r.createdAt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={ShieldCheck}
                    title="Nothing to verify"
                    text="New history rows from forms and imports appear here."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination meta={list.data?.meta} onPage={setPage} className="p-4" />
      <ConfirmDialog
        open={reject}
        onClose={() => setReject(false)}
        title="Reject history rows"
        message={`${sel.length} row(s) will not be used.`}
        confirmLabel="Reject"
        reasonLabel="Reason"
        onConfirm={(reason) => decide.mutate({ decision: 'REJECTED', reason })}
      />
    </Card>
  );
}

function Institutions() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const list = useQuery({
    queryKey: ['platform', 'directory', 'institutions', q, page],
    queryFn: () =>
      getPaged<DirInstitution & { programs: number; institutionId: string | null }>(
        '/platform/directory/institutions',
        { q: q || undefined, page },
      ),
  });
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <Input
          className="max-w-sm"
          placeholder="Search institutions"
          value={q}
          onChange={(e) => (setQ(e.target.value), setPage(1))}
          aria-label="Search institutions"
        />
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>
          Add institution
        </Button>
      </div>
      <DataTable
        loading={list.isLoading}
        rows={list.data?.data ?? []}
        rowKey={(r) => r._id}
        onRowClick={(r) => setOpen(r._id)}
        columns={[
          {
            key: 'name',
            header: 'Institution',
            primary: true,
            cell: (r) => <span className="text-ink font-semibold">{r.name}</span>,
          },
          { key: 'city', header: 'City', cell: (r) => `${r.city}, ${r.province}` },
          {
            key: 'type',
            header: 'Type',
            cell: (r) =>
              `${INSTITUTION_TYPES[r.type as keyof typeof INSTITUTION_TYPES]} · ${r.sector === 'PUBLIC' ? 'public' : 'private'}`,
          },
          { key: 'programs', header: 'Programs', cell: (r) => r.programs },
          {
            key: 'on',
            header: 'Source',
            cell: (r) =>
              r.institutionId ? <Badge tone="blue">On ADMITRA</Badge> : <Badge tone="gray">Directory only</Badge>,
          },
        ]}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} className="p-4" />
      {open && <InstitutionDrawer id={open} onClose={() => setOpen(null)} />}
      {create && (
        <InstitutionForm
          onClose={() => setCreate(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['platform', 'directory'] })}
        />
      )}
    </Card>
  );
}

function InstitutionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    name: '',
    shortName: '',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: '',
    province: 'Punjab',
    website: '',
    about: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => post('/platform/directory/institutions', v),
    onSuccess: () => (toast.success('Institution added to the directory.'), onSaved(), onClose()),
    onError: (e) => (setErrors(fieldErrors(e)), toast.error(errorMessage(e))),
  });
  const set = (k: keyof typeof v, x: string) => setV({ ...v, [k]: x });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add institution"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="di-name" required error={errors.name} className="sm:col-span-2">
          <Input id="di-name" value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Short name" htmlFor="di-short" error={errors.shortName}>
          <Input id="di-short" value={v.shortName} onChange={(e) => set('shortName', e.target.value)} />
        </Field>
        <Field label="Type" htmlFor="di-type">
          <Select id="di-type" value={v.type} onChange={(e) => set('type', e.target.value)}>
            {Object.entries(INSTITUTION_TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sector" htmlFor="di-sector">
          <Select id="di-sector" value={v.sector} onChange={(e) => set('sector', e.target.value)}>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </Select>
        </Field>
        <Field label="Province" htmlFor="di-prov">
          <Select id="di-prov" value={v.province} onChange={(e) => set('province', e.target.value)}>
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="di-city" required error={errors.city}>
          <Input id="di-city" value={v.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Website" htmlFor="di-web" error={errors.website}>
          <Input
            id="di-web"
            placeholder="https://"
            value={v.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </Field>
        <Field label="About" htmlFor="di-about" className="sm:col-span-2">
          <Textarea id="di-about" rows={3} value={v.about} onChange={(e) => set('about', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function InstitutionDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [addProgram, setAddProgram] = useState(false);
  const [addHistory, setAddHistory] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['platform', 'directory', 'institution', id],
    queryFn: () =>
      get<{ institution: DirInstitution; programs: (DirProgram & { history: (HistoryRow & { status: string })[] })[] }>(
        `/platform/directory/institutions/${id}`,
      ),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform', 'directory'] });
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={q.data?.institution.name ?? 'Institution'}
      description={q.data ? `${q.data.institution.city}, ${q.data.institution.province}` : undefined}
      footer={
        <Button icon={<Plus className="size-4" />} onClick={() => setAddProgram(true)}>
          Add program
        </Button>
      }
    >
      <div className="space-y-3">
        {q.data?.programs.map((p) => (
          <div key={p._id} className="border-line rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-ink font-semibold">{p.title}</p>
                <p className="text-muted text-[12px]">
                  {DEGREE_LEVELS[p.degreeLevel as keyof typeof DEGREE_LEVELS] ?? p.degreeLevel} ·{' '}
                  {formatMoney(p.feePerSemester)} / semester · {p.seats} seats
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-4" />}
                onClick={() => setAddHistory(p._id)}
              >
                History row
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.history.slice(0, 9).map((h, i) => (
                <Badge
                  key={i}
                  tone={h.status === 'VERIFIED' ? 'green' : h.status === 'DRAFT' ? 'amber' : 'red'}
                  dot={false}
                >
                  {h.year} L{h.round}: {h.closingMerit.toFixed(1)}
                </Badge>
              ))}
              {p.history.length === 0 && <span className="text-muted text-[12px]">No history</span>}
            </div>
          </div>
        ))}
      </div>
      {addProgram && <ProgramForm institutionId={id} onClose={() => setAddProgram(false)} onSaved={refresh} />}
      {addHistory && q.data && (
        <HistoryForm
          url="/platform/directory/history"
          programs={q.data.programs}
          programId={addHistory}
          onClose={() => setAddHistory(null)}
          onSaved={refresh}
        />
      )}
    </Modal>
  );
}

function ProgramForm({
  institutionId,
  onClose,
  onSaved,
}: {
  institutionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    title: '',
    degreeLevel: 'BS',
    fieldGroup: '',
    feePerSemester: '',
    seats: '',
    minMatric: '45',
    minInter: '50',
    groups: '',
    matric: '10',
    inter: '40',
    test: '50',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const formula = [
        { component: 'MATRIC', weight: Number(v.matric) },
        { component: 'INTERMEDIATE', weight: Number(v.inter) },
        { component: 'ENTRY_TEST', weight: Number(v.test) },
      ].filter((f) => f.weight > 0);
      return post('/platform/directory/programs', {
        directoryInstitutionId: institutionId,
        title: v.title,
        degreeLevel: v.degreeLevel,
        fieldGroup: v.fieldGroup,
        feePerSemester: Number(v.feePerSemester || 0),
        seats: Number(v.seats || 0),
        eligibility: [
          { level: 'MATRIC', minPercentage: Number(v.minMatric), groups: [] },
          {
            level: 'INTERMEDIATE',
            minPercentage: Number(v.minInter),
            groups: v.groups
              .split(',')
              .map((g) => g.trim())
              .filter(Boolean),
          },
        ],
        formula,
      });
    },
    onSuccess: () => (toast.success('Program added.'), onSaved(), onClose()),
    onError: (e) => (setErrors(fieldErrors(e)), toast.error(errorMessage(e))),
  });
  const set = (k: keyof typeof v, x: string) => setV({ ...v, [k]: x });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add program"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" htmlFor="dp-title" required error={errors.title} className="sm:col-span-2">
          <Input id="dp-title" value={v.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Degree" htmlFor="dp-deg">
          <Select id="dp-deg" value={v.degreeLevel} onChange={(e) => set('degreeLevel', e.target.value)}>
            {Object.entries(DEGREE_LEVELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Field" htmlFor="dp-field">
          <Input
            id="dp-field"
            placeholder="Computing"
            value={v.fieldGroup}
            onChange={(e) => set('fieldGroup', e.target.value)}
          />
        </Field>
        <Field label="Fee / semester" htmlFor="dp-fee">
          <Input
            id="dp-fee"
            inputMode="numeric"
            value={v.feePerSemester}
            onChange={(e) => set('feePerSemester', e.target.value)}
          />
        </Field>
        <Field label="Seats" htmlFor="dp-seats">
          <Input id="dp-seats" inputMode="numeric" value={v.seats} onChange={(e) => set('seats', e.target.value)} />
        </Field>
        <Field label="Min Matric %" htmlFor="dp-mm">
          <Input id="dp-mm" value={v.minMatric} onChange={(e) => set('minMatric', e.target.value)} />
        </Field>
        <Field label="Min Intermediate %" htmlFor="dp-mi">
          <Input id="dp-mi" value={v.minInter} onChange={(e) => set('minInter', e.target.value)} />
        </Field>
        <Field label="Required groups" htmlFor="dp-g" hint="Comma separated">
          <Input
            id="dp-g"
            placeholder="Pre-Engineering, ICS"
            value={v.groups}
            onChange={(e) => set('groups', e.target.value)}
          />
        </Field>
        <Field label="Matric weight" htmlFor="dp-wm">
          <Input id="dp-wm" value={v.matric} onChange={(e) => set('matric', e.target.value)} />
        </Field>
        <Field label="Intermediate weight" htmlFor="dp-wi">
          <Input id="dp-wi" value={v.inter} onChange={(e) => set('inter', e.target.value)} />
        </Field>
        <Field label="Entry test weight" htmlFor="dp-wt" error={errors.formula}>
          <Input id="dp-wt" value={v.test} onChange={(e) => set('test', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DataGaps() {
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useQuery({
    queryKey: ['platform', 'directory', 'gaps', year],
    queryFn: () =>
      get<
        {
          _id: string;
          title: string;
          institution: string;
          city: string;
          onAdmitra: boolean;
          lastVerifiedYear: number | null;
          draftsThisYear: number;
        }[]
      >('/platform/directory/data-gaps', { year }),
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`Programs without verified ${year} data`}
        subtitle="Refresh these every admission season (DIR-8)"
        action={
          <Select className="h-9 w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {[0, 1, 2].map((k) => (
              <option key={k}>{new Date().getFullYear() - k}</option>
            ))}
          </Select>
        }
      />
      <div className="mt-4">
        <DataTable
          loading={q.isLoading}
          rows={q.data ?? []}
          rowKey={(r) => r._id}
          empty={
            <EmptyState icon={CheckCircle2} title="No gaps" text="Every program has verified data for this year." />
          }
          columns={[
            {
              key: 'p',
              header: 'Program',
              primary: true,
              cell: (r) => <span className="text-ink font-semibold">{r.title}</span>,
            },
            { key: 'i', header: 'Institution', cell: (r) => `${r.institution}, ${r.city}` },
            {
              key: 'y',
              header: 'Latest verified year',
              cell: (r) => r.lastVerifiedYear ?? <span className="text-red-600">none</span>,
            },
            {
              key: 'd',
              header: 'Drafts this year',
              cell: (r) => (r.draftsThisYear ? <Badge tone="amber">{r.draftsThisYear} waiting</Badge> : '-'),
            },
            {
              key: 'o',
              header: 'Source',
              cell: (r) =>
                r.onAdmitra ? (
                  <Badge tone="blue">Automatic on publication</Badge>
                ) : (
                  <Badge tone="gray">Manual or import</Badge>
                ),
            },
          ]}
        />
      </div>
    </Card>
  );
}

function Claims({
  rows,
  onDone,
}: {
  rows: (DirInstitution & { claim: { institutionName: string; note: string; at: string } })[];
  onDone: () => void;
}) {
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      post(`/platform/directory/institutions/${v.id}/claim`, { decision: v.decision }),
    onSuccess: (_d, v) => (
      toast.success(v.decision === 'APPROVED' ? 'Claim approved and the listings merged.' : 'Claim rejected.'),
      onDone()
    ),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!rows.length)
    return (
      <Card>
        <EmptyState
          icon={Compass}
          title="No pending claims"
          text="Institutions can claim older listings from their Directory Data page."
        />
      </Card>
    );
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r._id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-ink text-[15px] font-bold">
              {r.claim.institutionName} <span className="text-muted font-normal">claims</span> {r.name}
            </p>
            <p className="text-muted mt-1 text-[13px]">
              “{r.claim.note}” · {formatDateTime(r.claim.at)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => decide.mutate({ id: r._id, decision: 'REJECTED' })}>
              Reject
            </Button>
            <Button loading={decide.isPending} onClick={() => decide.mutate({ id: r._id, decision: 'APPROVED' })}>
              Approve
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AdvisorUsage() {
  const q = useQuery({
    queryKey: ['platform', 'advisor-stats'],
    queryFn: () =>
      get<{
        runs: number;
        byDay: { day: string; runs: number }[];
        demand: { program: string; institution: string; count: number }[];
        averages: { matric: number; inter: number; signedIn: number } | null;
      }>('/platform/directory/advisor-stats'),
  });
  const d = q.data;
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader
          title={`${d?.runs ?? 0} advisor runs in the last 30 days`}
          subtitle={
            d?.averages
              ? `Average marks: Matric ${d.averages.matric}%, Intermediate ${d.averages.inter}% · ${d.averages.signedIn} by signed-in applicants`
              : 'Anonymous usage (PRED-12)'
          }
        />
        <div className="h-72 px-2 pt-4 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.byDay ?? []} margin={{ left: -16, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="day"
                tickFormatter={(x: string) => x.slice(5)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--card-soft)' }}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12 }}
              />
              <Bar dataKey="runs" name="Runs" fill="#1F6FEB" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <CardHeader title="Demand by program" subtitle="Shown as Safe or Target most often" />
        <ol className="mt-3">
          {(d?.demand ?? []).map((x, i) => (
            <li key={i} className="border-line flex items-center gap-3 border-t px-5 py-3 text-[13px]">
              <span className="bg-primary-soft text-primary flex size-7 items-center justify-center rounded-full text-[12px] font-bold">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <b className="text-ink block truncate">{x.program}</b>
                <span className="text-muted">{x.institution}</span>
              </span>
              <b className="text-ink tabular-nums">{x.count}</b>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
