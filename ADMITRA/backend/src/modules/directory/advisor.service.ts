import { TRUST } from '../../constants/academics';
import { STANDARD_FORMULA_NO_TEST, STANDARD_FORMULA_WITH_TEST } from '../../constants/advisor';
import { COMPONENT_LABELS, computeAggregate, predictChance, type MeritComponentType } from '../../lib/merit';
import type { Id } from '../../lib/types';
import { ApplicationModel } from '../applications/application.model';
import { currentRecords } from '../applications/application.service';
import { CampaignModel } from '../campaigns/campaign.model';
import { MeritFormulaModel } from '../merit/merit.models';
import { RecordModel } from '../records/record.models';
import { DirInstitutionModel, DirProgramModel, MeritHistoryModel } from './directory.models';

export interface AdvisorInput {
  matric: number;
  inter: number;
  test?: number | null;
  fieldGroup?: string;
  degreeLevel?: string;
  city?: string;
  province?: string;
  sector?: string;
  maxFee?: number;
  shift?: string;
  q?: string;
}

export type MarksBasis = 'VERIFIED' | 'SELF_DECLARED' | 'ENTERED';

type DirProgramLean = Awaited<ReturnType<typeof loadPrograms>>[number];
type HistoryLean = {
  year: number;
  round: number;
  shift: string;
  closingMerit: number;
  openingMerit?: number | null;
  source: string;
  sourceUrl?: string;
  origin: string;
  seats?: number | null;
  quota: string;
  status: string;
};

async function loadPrograms(filter: Record<string, unknown>) {
  return DirProgramModel.find({ status: 'ACTIVE', ...filter }).lean();
}

export async function savedMarks(userId: Id) {
  const records = await currentRecords(userId);
  const best = (level: string) =>
    records.filter((r) => r.level === level).sort((a, b) => b.percentage - a.percentage)[0];
  const matric = best('MATRIC');
  const inter = best('INTERMEDIATE');
  const test = best('ENTRY_TEST');
  const used = [matric, inter, test].filter(Boolean);
  const basis: MarksBasis =
    used.length && used.every((r) => r!.trustLevel >= TRUST.REGISTRY) ? 'VERIFIED' : 'SELF_DECLARED';
  return {
    matric: matric?.percentage ?? null,
    inter: inter?.percentage ?? null,
    test: test?.percentage ?? null,
    fieldGroup: inter?.group ?? '',
    basis,
  };
}

function closingsFor(history: HistoryLean[], shift: string) {
  const forShift = history.filter((h) => h.shift === shift);
  const rows = forShift.length ? forShift : history;
  const byYear = new Map<number, HistoryLean>();
  for (const h of rows) {
    const cur = byYear.get(h.year);
    if (!cur || h.round > cur.round || (h.round === cur.round && h.closingMerit < cur.closingMerit))
      byYear.set(h.year, h);
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

function formulaOf(p: DirProgramLean, hasTest: boolean) {
  const own = (p.formula ?? []).filter((f) => f.component && f.weight);
  const total = own.reduce((s, f) => s + (f.weight ?? 0), 0);
  if (own.length && Math.round(total) === 100)
    return { lines: own as { component: MeritComponentType; weight: number }[], standard: false };
  const std = p.testName || hasTest ? STANDARD_FORMULA_WITH_TEST : STANDARD_FORMULA_NO_TEST;
  return {
    lines: std.map((x) => ({ ...x })) as { component: MeritComponentType; weight: number }[],
    standard: true,
  };
}

function eligibilityOf(p: DirProgramLean, input: AdvisorInput) {
  const reasons: string[] = [];
  for (const e of p.eligibility ?? []) {
    const pct =
      e.level === 'MATRIC'
        ? input.matric
        : e.level === 'INTERMEDIATE'
          ? input.inter
          : e.level === 'ENTRY_TEST'
            ? input.test
            : null;
    const label = COMPONENT_LABELS[e.level as MeritComponentType] ?? e.level;
    if (pct == null) {
      if (e.level !== 'ENTRY_TEST') reasons.push(`${label} result needed`);
      continue;
    }
    if (e.minPercentage != null && pct < e.minPercentage)
      reasons.push(`${label} ${pct}% is below the minimum of ${e.minPercentage}%`);
    if (e.level === 'INTERMEDIATE' && e.groups?.length && input.fieldGroup) {
      const ok = e.groups.some(
        (g) =>
          g.toLowerCase() === input.fieldGroup!.toLowerCase() ||
          g.toLowerCase().startsWith(input.fieldGroup!.toLowerCase()),
      );
      if (!ok) reasons.push(`Intermediate group must be ${e.groups.join(' or ')}`);
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

async function standingIn(programId: Id, campaignId: Id, aggregate: number) {
  const formula = await MeritFormulaModel.findOne({ campaignId, programId, status: 'ACTIVE' }).lean();
  if (!formula) return null;
  const apps = await ApplicationModel.find({
    campaignId,
    'preferences.programId': programId,
    status: { $nin: ['DRAFT', 'WITHDRAWN', 'REJECTED'] },
  })
    .select('applicantId')
    .lean();
  if (apps.length < 5) return null;
  const records = await RecordModel.find({ userId: { $in: apps.map((a) => a.applicantId) }, current: true })
    .select('userId level testName percentage trustLevel')
    .lean();
  const aggs: number[] = [];
  for (const a of apps) {
    const mine = records.filter((r) => String(r.userId) === String(a.applicantId));
    const r = computeAggregate(formula.components as never, mine as never, TRUST.REGISTRY);
    if (r.ok) aggs.push(r.aggregate);
  }
  if (aggs.length < 5) return null;
  const above = aggs.filter((x) => x > aggregate).length;
  const share = above / aggs.length;
  const band = share < 0.1 ? 'TOP_10' : share < 0.25 ? 'TOP_25' : share < 0.5 ? 'TOP_50' : 'LOWER';
  return { band, applicants: aggs.length } as const;
}

export async function adviseProgram(
  p: DirProgramLean,
  inst: {
    _id: unknown;
    name: string;
    shortName?: string;
    slug: string;
    city: string;
    province: string;
    sector: string;
    type: string;
    institutionId?: unknown;
    website?: string;
  },
  history: HistoryLean[],
  input: AdvisorInput,
  opts: { standing?: boolean } = {},
) {
  const hasTest = input.test != null;
  const { lines, standard } = formulaOf(p, hasTest);
  const usesTest = lines.some((l) => l.component === 'ENTRY_TEST');
  const assumedTest = usesTest && !hasTest;
  const marks = [
    { level: 'MATRIC', percentage: input.matric, trustLevel: 3 },
    { level: 'INTERMEDIATE', percentage: input.inter, trustLevel: 3 },
    { level: 'ENTRY_TEST', percentage: hasTest ? input.test! : input.inter, trustLevel: 3 },
  ];
  const agg = computeAggregate(
    lines.map((l) => ({ type: l.component, weight: l.weight, required: false })),
    marks,
  );
  const shift =
    input.shift && (p.shifts ?? []).includes(input.shift as never)
      ? input.shift
      : ((p.shifts ?? [])[0] ?? 'MORNING');
  const closings = closingsFor(history, shift);
  const prediction = predictChance(
    agg.aggregate,
    closings.slice(0, 3).map((c) => c.closingMerit),
  );
  const elig = eligibilityOf(p, input);
  let openCampaign: { campaignId: unknown; programId: unknown; closesAt: Date; title: string } | null = null;
  if (p.programId) {
    const c = await CampaignModel.findOne({
      status: 'OPEN',
      closesAt: { $gt: new Date() },
      'programs.programId': p.programId,
    })
      .select('title closesAt')
      .lean();
    if (c) openCampaign = { campaignId: c._id, programId: p.programId, closesAt: c.closesAt, title: c.title };
  }
  const last = closings[0];
  return {
    directoryProgramId: p._id,
    title: p.title,
    degreeLevel: p.degreeLevel,
    fieldGroup: p.fieldGroup,
    feePerSemester: p.feePerSemester,
    seats: p.seats,
    shift,
    institution: {
      _id: inst._id,
      name: inst.name,
      shortName: inst.shortName ?? '',
      slug: inst.slug,
      city: inst.city,
      province: inst.province,
      sector: inst.sector,
      type: inst.type,
      onAdmitra: Boolean(inst.institutionId),
      website: inst.website ?? '',
    },
    aggregate: agg.aggregate,
    breakdown: agg.breakdown,
    standardFormula: standard,
    assumedTest,
    eligible: elig.eligible,
    reasons: elig.reasons,
    history: closings.slice(0, 3).map((c) => ({
      year: c.year,
      round: c.round,
      closing: c.closingMerit,
      source: c.source,
      sourceUrl: c.sourceUrl ?? '',
      origin: c.origin,
    })),
    lastClosing: last?.closingMerit ?? null,
    gap: last ? Math.round((agg.aggregate - last.closingMerit) * 100) / 100 : null,
    prediction,
    band: !elig.eligible ? 'NOT_ELIGIBLE' : (prediction?.band ?? 'INSUFFICIENT_DATA'),
    openCampaign,
    applyUrl: p.applyUrl || inst.website || '',
    standing:
      opts.standing && openCampaign
        ? await standingIn(p.programId as Id, openCampaign.campaignId as Id, agg.aggregate)
        : null,
  };
}

export type AdvisorResult = Awaited<ReturnType<typeof adviseProgram>>;

export async function advise(input: AdvisorInput) {
  const instFilter: Record<string, unknown> = { status: 'ACTIVE' };
  if (input.city) instFilter.city = input.city;
  if (input.province) instFilter.province = input.province;
  if (input.sector) instFilter.sector = input.sector;
  const insts = await DirInstitutionModel.find(instFilter).lean();
  const progFilter: Record<string, unknown> = { directoryInstitutionId: { $in: insts.map((i) => i._id) } };
  if (input.degreeLevel) progFilter.degreeLevel = input.degreeLevel;
  if (input.maxFee) progFilter.feePerSemester = { $lte: input.maxFee };
  if (input.shift) progFilter.shifts = input.shift;
  if (input.q) progFilter.title = { $regex: input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const programs = await loadPrograms(progFilter);
  const histories = await MeritHistoryModel.find({
    directoryProgramId: { $in: programs.map((p) => p._id) },
    status: 'VERIFIED',
  }).lean();
  const out: AdvisorResult[] = [];
  for (const p of programs) {
    const inst = insts.find((i) => String(i._id) === String(p.directoryInstitutionId))!;
    const h = histories.filter(
      (x) => String(x.directoryProgramId) === String(p._id),
    ) as unknown as HistoryLean[];
    out.push(await adviseProgram(p, inst as never, h, input));
  }
  const rank = { SAFE: 0, TARGET: 1, REACH: 2, UNLIKELY: 3, INSUFFICIENT_DATA: 4, NOT_ELIGIBLE: 5 } as Record<
    string,
    number
  >;
  out.sort(
    (a, b) =>
      rank[a.band]! - rank[b.band]! ||
      (b.prediction?.chance ?? 0) - (a.prediction?.chance ?? 0) ||
      b.aggregate - a.aggregate,
  );
  return out;
}

export async function explain(directoryProgramId: Id, input: AdvisorInput) {
  const p = await DirProgramModel.findById(directoryProgramId).lean();
  if (!p) return null;
  const inst = await DirInstitutionModel.findById(p.directoryInstitutionId).lean();
  const history = (await MeritHistoryModel.find({ directoryProgramId: p._id, status: 'VERIFIED' })
    .sort({ year: -1, round: -1 })
    .lean()) as unknown as HistoryLean[];
  const r = await adviseProgram(p, inst as never, history, input, { standing: true });
  return {
    ...r,
    program: p,
    allHistory: history.map((h) => ({
      year: h.year,
      round: h.round,
      shift: h.shift,
      quota: h.quota,
      openingMerit: h.openingMerit ?? null,
      closingMerit: h.closingMerit,
      seats: h.seats ?? null,
      source: h.source,
      sourceUrl: h.sourceUrl ?? '',
      origin: h.origin,
    })),
  };
}
