'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Compass,
  ExternalLink,
  GitCompare,
  Info,
  Sparkles,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage, fieldErrors, get, post } from '@/lib/api';
import { DEGREE_LEVELS, PROVINCES, SHIFTS } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BANDS, BandBadge, ChanceRing } from './band';
import { INTER_GROUPS, type AdvisorInputs, type AdvisorMeta, type AdvisorResult, type Band } from './types';

const ORDER: Band[] = ['SAFE', 'TARGET', 'REACH', 'UNLIKELY', 'INSUFFICIENT_DATA', 'NOT_ELIGIBLE'];
const SORTS = {
  chance: 'Best chance',
  aggregate: 'Highest aggregate',
  fee: 'Lowest fee',
  gap: 'Largest margin',
  deadline: 'Closing soon',
} as const;
const COMPARE_KEY = 'admitra.compare';

const EMPTY: AdvisorInputs = {
  matric: '',
  inter: '',
  test: '',
  fieldGroup: '',
  degreeLevel: 'BS',
  city: '',
  province: '',
  sector: '',
  maxFee: '',
  shift: '',
  useSaved: false,
};

function bodyOf(v: AdvisorInputs) {
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  return {
    useSaved: v.useSaved,
    matric: v.useSaved ? undefined : num(v.matric),
    inter: v.useSaved ? undefined : num(v.inter),
    test: v.test.trim() === '' ? (v.useSaved ? undefined : null) : Number(v.test),
    fieldGroup: v.fieldGroup || undefined,
    degreeLevel: v.degreeLevel || undefined,
    city: v.city || undefined,
    province: v.province || undefined,
    sector: v.sector || undefined,
    maxFee: num(v.maxFee),
    shift: v.shift || undefined,
  };
}

// The comparison selection is a per-viewer convenience kept in this browser only.
const compareListeners = new Set<() => void>();
function readCompare(): string {
  try {
    return localStorage.getItem(COMPARE_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}
function subscribeCompare(cb: () => void) {
  compareListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    compareListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

export function useCompare() {
  const raw = useSyncExternalStore(subscribeCompare, readCompare, () => '[]');
  const ids = useMemo(() => {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }, [raw]);
  const save = (next: string[]) => {
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    compareListeners.forEach((l) => l());
  };
  const toggle = (id: string) => {
    if (ids.includes(id)) save(ids.filter((x) => x !== id));
    else if (ids.length >= 4) toast.error('You can compare up to four programs.');
    else save([...ids, id]);
  };
  return { ids, toggle, clear: () => save([]) };
}

/** PRED-10: programs saved by a signed-in applicant. */
export function useShortlist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isApplicant = user?.accountType === 'APPLICANT';
  const list = useQuery({
    queryKey: ['me', 'shortlist'],
    queryFn: () => get<{ _id: string; program: { _id: string } }[]>('/me/shortlist'),
    enabled: isApplicant,
  });
  const saved = new Map((list.data ?? []).map((i) => [i.program._id, i._id]));
  const toggle = useMutation({
    mutationFn: async (programId: string) => {
      const existing = saved.get(programId);
      if (existing) await api.delete(`/me/shortlist/${existing}`);
      else await post('/me/shortlist', { directoryProgramId: programId });
      return !existing;
    },
    onSuccess: (added) => {
      toast.success(added ? 'Saved to your shortlist.' : 'Removed from your shortlist.');
      void qc.invalidateQueries({ queryKey: ['me', 'shortlist'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return { isApplicant, saved, toggle };
}

export function AdvisorPage({ base = '' }: { base?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const isApplicant = user?.accountType === 'APPLICANT';
  const [form, setV] = useState<AdvisorInputs>({ ...EMPTY, useSaved: false });
  // Signed-in applicants start with their saved marks until they untick the option (PRED-2).
  const [savedChoice, setSavedChoice] = useState<boolean | null>(null);
  const v = useMemo(() => ({ ...form, useSaved: savedChoice ?? isApplicant }), [form, savedChoice, isApplicant]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [band, setBand] = useState<Band | 'ALL'>('ALL');
  const [sort, setSort] = useState<keyof typeof SORTS>('chance');
  const compare = useCompare();
  const shortlist = useShortlist();
  const ran = useRef(false);
  const filters = useQuery({
    queryKey: ['directory', 'filters'],
    queryFn: () => get<{ cities: string[]; interGroups: string[] }>('/public/directory/filters'),
  });

  const run = useMutation({
    mutationFn: async (input: AdvisorInputs) => {
      const r = await api.post<{ data: AdvisorResult[]; meta: AdvisorMeta }>('/public/advisor', bodyOf(input));
      return r.data;
    },
    onSuccess: () => setErrors({}),
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(errorMessage(e));
    },
  });

  // PRED-10 what-if: once results are shown, changes are recalculated straight away.
  useEffect(() => {
    if (!ran.current) return;
    const t = setTimeout(() => run.mutate(v), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const set = <K extends keyof AdvisorInputs>(k: K, val: AdvisorInputs[K]) => setV((x) => ({ ...x, [k]: val }));
  const results = run.data?.data;
  const meta = run.data?.meta;

  const shown = useMemo(() => {
    const list = (results ?? []).filter((r) => band === 'ALL' || r.band === band);
    const by: Record<keyof typeof SORTS, (a: AdvisorResult, b: AdvisorResult) => number> = {
      chance: (a, b) =>
        ORDER.indexOf(a.band) - ORDER.indexOf(b.band) || (b.prediction?.chance ?? 0) - (a.prediction?.chance ?? 0),
      aggregate: (a, b) => b.aggregate - a.aggregate,
      fee: (a, b) => a.feePerSemester - b.feePerSemester,
      gap: (a, b) => (b.gap ?? -999) - (a.gap ?? -999),
      deadline: (a, b) =>
        (a.openCampaign ? new Date(a.openCampaign.closesAt).getTime() : Infinity) -
        (b.openCampaign ? new Date(b.openCampaign.closesAt).getTime() : Infinity),
    };
    return [...list].sort(by[sort]);
  }, [results, band, sort]);

  const explainHref = (id: string) => {
    const q = new URLSearchParams();
    if (meta) {
      q.set('matric', String(meta.inputs.matric));
      q.set('inter', String(meta.inputs.inter));
      if (meta.inputs.test != null) q.set('test', String(meta.inputs.test));
      if (meta.inputs.fieldGroup) q.set('group', meta.inputs.fieldGroup);
    }
    if (v.useSaved) q.set('saved', '1');
    return `${base}/advisor/${id}?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <section className="hero-gradient relative overflow-hidden rounded-[24px] px-6 py-8 text-white sm:px-10 sm:py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold text-blue-100 ring-1 ring-white/15">
            <Compass className="size-4" /> Admission Advisor
          </span>
          <h1 className="mt-4 text-[28px] leading-tight font-extrabold tracking-tight text-white sm:text-[38px]">
            Where can I get admission?
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-blue-100/90">
            Enter your marks and see, in one place, the colleges and universities where your name is likely to appear,
            with your chance in each, based on the verified closing merit of the last three years.
          </p>
        </motion.div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr] 2xl:grid-cols-[400px_1fr]">
        <Card className="h-fit p-5 sm:p-6 xl:sticky xl:top-24">
          <h2 className="text-[16px] font-bold">Your marks</h2>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              ran.current = true;
              run.mutate(v);
            }}
            noValidate
          >
            {isApplicant && (
              <Checkbox
                label="Use my saved marks"
                description="Your Matric, Intermediate and entry-test results from your academic record."
                checked={v.useSaved}
                onChange={(e) => setSavedChoice(e.target.checked)}
              />
            )}
            {!v.useSaved && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Matric %" htmlFor="matric" required error={errors.matric}>
                  <Input
                    id="matric"
                    inputMode="decimal"
                    placeholder="e.g. 86.4"
                    value={v.matric}
                    onChange={(e) => set('matric', e.target.value)}
                  />
                </Field>
                <Field label="Intermediate %" htmlFor="inter" required error={errors.inter}>
                  <Input
                    id="inter"
                    inputMode="decimal"
                    placeholder="e.g. 81.2"
                    value={v.inter}
                    onChange={(e) => set('inter', e.target.value)}
                  />
                </Field>
              </div>
            )}
            <Field
              label="Entry test %"
              htmlFor="test"
              hint={
                v.useSaved
                  ? 'Leave empty to use your saved test result.'
                  : 'Optional. Leave empty if you have not taken a test yet.'
              }
              error={errors.test}
            >
              <Input
                id="test"
                inputMode="decimal"
                placeholder="e.g. 84"
                value={v.test}
                onChange={(e) => set('test', e.target.value)}
              />
            </Field>
            <Field label="Intermediate group" htmlFor="group">
              <Select id="group" value={v.fieldGroup} onChange={(e) => set('fieldGroup', e.target.value)}>
                <option value="">{v.useSaved ? 'From my record' : 'Any group'}</option>
                {(filters.data?.interGroups ?? INTER_GROUPS).map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Degree" htmlFor="degree">
                <Select id="degree" value={v.degreeLevel} onChange={(e) => set('degreeLevel', e.target.value)}>
                  <option value="">Any</option>
                  {Object.entries(DEGREE_LEVELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Shift" htmlFor="shift">
                <Select id="shift" value={v.shift} onChange={(e) => set('shift', e.target.value)}>
                  <option value="">Any</option>
                  {Object.entries(SHIFTS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Province" htmlFor="province">
                <Select id="province" value={v.province} onChange={(e) => set('province', e.target.value)}>
                  <option value="">All</option>
                  {PROVINCES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </Field>
              <Field label="City" htmlFor="city">
                <Select id="city" value={v.city} onChange={(e) => set('city', e.target.value)}>
                  <option value="">All</option>
                  {(filters.data?.cities ?? []).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Sector" htmlFor="sector">
                <Select id="sector" value={v.sector} onChange={(e) => set('sector', e.target.value)}>
                  <option value="">All</option>
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private</option>
                </Select>
              </Field>
              <Field label="Max fee / semester" htmlFor="fee">
                <Input
                  id="fee"
                  inputMode="numeric"
                  placeholder="Rs."
                  value={v.maxFee}
                  onChange={(e) => set('maxFee', e.target.value)}
                />
              </Field>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={run.isPending && !results}
              icon={<Sparkles className="size-4" />}
            >
              Show my chances
            </Button>
          </form>
        </Card>

        <div className="min-w-0 space-y-5">
          {!results ? (
            <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="bg-primary-soft text-primary flex size-14 items-center justify-center rounded-2xl">
                <Compass className="size-7" />
              </span>
              <h2 className="mt-4 text-[18px] font-bold">Your chances will appear here</h2>
              <p className="text-muted mt-2 max-w-md text-[14px]">
                Programs are classified as <b>Safe</b> (85% or more), <b>Target</b> (50-85%), <b>Reach</b> (20-50%) or{' '}
                <b>Unlikely</b>. Only verified merit history is used.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={meta?.basis === 'VERIFIED' ? 'green' : meta?.basis === 'SELF_DECLARED' ? 'amber' : 'gray'}>
                  {meta?.basis === 'VERIFIED'
                    ? 'Based on verified marks'
                    : meta?.basis === 'SELF_DECLARED'
                      ? 'Based on self-declared marks'
                      : 'Based on the marks you entered'}
                </Badge>
                <span className="text-muted text-[13px]">
                  Matric {meta?.inputs.matric}% · Intermediate {meta?.inputs.inter}%
                  {meta?.inputs.test != null ? ` · Test ${meta.inputs.test}%` : ''}
                </span>
                {run.isPending && <span className="text-primary text-[12.5px] font-semibold">Updating…</span>}
              </div>
              <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6" gap={0.05}>
                {ORDER.map((b) => (
                  <StaggerItem key={b}>
                    <button
                      onClick={() => setBand(band === b ? 'ALL' : b)}
                      className={cn(
                        'w-full rounded-2xl border p-4 text-left transition hover:shadow-md',
                        band === b ? 'border-primary bg-primary-soft' : 'border-line bg-card',
                      )}
                    >
                      <p className="text-ink text-[26px] leading-none font-extrabold tabular-nums">
                        {meta?.bands[b] ?? 0}
                      </p>
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
                        <span className="size-2 rounded-full" style={{ background: BANDS[b].ring }} />
                        {BANDS[b].label}
                      </p>
                      <p className="text-muted mt-0.5 text-[11.5px]">{BANDS[b].text}</p>
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted text-[13.5px]">
                  {shown.length} program{shown.length === 1 ? '' : 's'}
                  {band !== 'ALL' && (
                    <button className="text-primary ml-2 font-semibold" onClick={() => setBand('ALL')}>
                      Show all
                    </button>
                  )}
                </p>
                <Select
                  className="h-10 w-48"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}
                  aria-label="Sort results"
                >
                  {Object.entries(SORTS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <Stagger key={`${band}-${sort}`} className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" gap={0.04}>
                {shown.map((r) => (
                  <StaggerItem key={r.directoryProgramId} hover className="h-full min-w-0">
                    <ResultCard
                      r={r}
                      explainHref={explainHref(r.directoryProgramId)}
                      compared={compare.ids.includes(r.directoryProgramId)}
                      onCompare={() => compare.toggle(r.directoryProgramId)}
                      saved={shortlist.saved.has(r.directoryProgramId)}
                      onSave={() =>
                        shortlist.isApplicant
                          ? shortlist.toggle.mutate(r.directoryProgramId)
                          : router.push('/login?next=/advisor')
                      }
                    />
                  </StaggerItem>
                ))}
              </Stagger>
              <p className="text-muted flex items-start gap-2 text-[12.5px]">
                <Info className="mt-0.5 size-4 shrink-0" /> {meta?.notice}
              </p>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {compare.ids.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6"
          >
            <div className="bg-navy flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-2xl">
              <GitCompare className="size-5" />
              <span className="text-[13.5px] font-semibold">{compare.ids.length} of 4 selected</span>
              <ButtonLink href={`${base}/compare?ids=${compare.ids.join(',')}`} size="sm">
                Compare
              </ButtonLink>
              <button
                onClick={compare.clear}
                aria-label="Clear comparison"
                className="rounded-lg p-1 hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultCard({
  r,
  explainHref,
  compared,
  onCompare,
  saved,
  onSave,
}: {
  r: AdvisorResult;
  explainHref: string;
  compared: boolean;
  onCompare: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <Card className="group flex h-full flex-col p-5 transition-shadow hover:shadow-lg">
      <div className="flex items-start gap-4">
        <ChanceRing chance={r.prediction?.chance ?? null} band={r.band} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <BandBadge band={r.band} />
            <button
              onClick={onSave}
              aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
              className="text-muted hover:text-primary -mt-1 rounded-lg p-1"
            >
              {saved ? <BookmarkCheck className="text-primary size-5" /> : <Bookmark className="size-5" />}
            </button>
          </div>
          <h3 className="text-ink mt-2 text-[15.5px] leading-snug font-bold">{r.title}</h3>
          <p className="text-muted truncate text-[13px]">
            {r.institution.name} · {r.institution.city}
          </p>
        </div>
      </div>
      <dl className="border-line mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-[12.5px]">
        <div>
          <dt className="text-muted">Your aggregate</dt>
          <dd className="text-ink text-[15px] font-bold tabular-nums">{r.aggregate.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted">Last closing</dt>
          <dd className="text-ink text-[15px] font-bold tabular-nums">{r.lastClosing?.toFixed(2) ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-muted">Margin</dt>
          <dd
            className={cn(
              'text-[15px] font-bold tabular-nums',
              r.gap == null
                ? 'text-muted'
                : r.gap >= 0
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400',
            )}
          >
            {r.gap == null ? '-' : `${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(2)}`}
          </dd>
        </div>
      </dl>
      <div className="text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <span>{formatMoney(r.feePerSemester)} / semester</span>
        <span>{r.history.length ? `Data ${r.history.map((h) => h.year).join(', ')}` : 'No verified data'}</span>
        {r.institution.onAdmitra && <span className="text-primary font-semibold">On ADMITRA</span>}
      </div>
      {!r.eligible && <p className="mt-2 text-[12.5px] font-medium text-red-700 dark:text-red-400">{r.reasons[0]}</p>}
      {r.openCampaign && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-green-700 dark:text-green-400">
          <CalendarClock className="size-4" /> Admissions open until {formatDate(r.openCampaign.closesAt)}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <ButtonLink href={explainHref} size="sm" variant="secondary">
          Explain
        </ButtonLink>
        <button
          onClick={onCompare}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition',
            compared ? 'border-primary bg-primary-soft text-primary' : 'border-line text-body hover:bg-card-soft',
          )}
        >
          <GitCompare className="size-4" /> {compared ? 'Comparing' : 'Compare'}
        </button>
        {r.openCampaign ? (
          <ButtonLink
            href={`/applicant/apply?campaign=${r.openCampaign.campaignId}&program=${r.openCampaign.programId}`}
            size="sm"
            className="ml-auto"
            icon={<ArrowRight className="size-4" />}
          >
            Apply now
          </ButtonLink>
        ) : r.applyUrl ? (
          <a
            href={r.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary ml-auto inline-flex items-center gap-1 text-[13px] font-semibold"
          >
            Official website <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    </Card>
  );
}

export function NoticeBox({ text }: { text: string }) {
  return (
    <Alert tone="info" title="An estimate, not a guarantee">
      {text}
    </Alert>
  );
}
