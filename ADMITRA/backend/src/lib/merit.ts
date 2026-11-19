/**
 * Merit engine (Section 3.12 of the proposal). Pure functions with no database access, so that
 * the aggregate, the tie-breakers and the seat allocation can be tested on their own.
 */

export const MERIT_COMPONENTS = [
  'MATRIC',
  'INTERMEDIATE',
  'BACHELOR_14',
  'BACHELOR_16',
  'MASTER',
  'ENTRY_TEST',
] as const;
export type MeritComponentType = (typeof MERIT_COMPONENTS)[number];

export const TIE_BREAKERS = ['ENTRY_TEST', 'INTERMEDIATE', 'MATRIC', 'BACHELOR', 'YOUNGER'] as const;
export type TieBreaker = (typeof TIE_BREAKERS)[number];

export const COMPONENT_LABELS: Record<MeritComponentType, string> = {
  MATRIC: 'Matric / O-Level',
  INTERMEDIATE: 'Intermediate / A-Level',
  BACHELOR_14: "Bachelor's (14 years)",
  BACHELOR_16: "Bachelor's (16 years)",
  MASTER: "Master's",
  ENTRY_TEST: 'Entry test',
};

export interface FormulaComponent {
  type: MeritComponentType;
  /** Name of the entry test when type is ENTRY_TEST (empty = any entry test). */
  testName?: string | null;
  weight: number;
  minPercentage?: number | null;
  required: boolean;
}

export interface MeritRecord {
  level: string;
  testName?: string | null;
  percentage: number;
  trustLevel: number;
}

export interface BreakdownLine {
  component: MeritComponentType;
  label: string;
  percentage: number | null;
  weight: number;
  contribution: number;
  note?: string;
}

export interface AggregateResult {
  ok: boolean;
  aggregate: number;
  breakdown: BreakdownLine[];
  /** Why the applicant cannot enter the ranking (MARK-10, MERIT-1). */
  reason?: string;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** MERIT-1: weights must add up to 100 and each component may appear once. */
export function validateComponents(components: FormulaComponent[]): string | null {
  if (!components.length) return 'Add at least one component.';
  const total = round(
    components.reduce((s, c) => s + c.weight, 0),
    2,
  );
  if (total !== 100) return `Weights must total 100 (now ${total}).`;
  const keys = components.map((c) => `${c.type}:${(c.testName ?? '').toLowerCase()}`);
  if (new Set(keys).size !== keys.length) return 'A component can be used only once.';
  if (components.some((c) => c.weight <= 0)) return 'Every weight must be greater than zero.';
  return null;
}

function recordFor(c: FormulaComponent, records: MeritRecord[]) {
  return records.find(
    (r) =>
      r.level === c.type &&
      (c.type !== 'ENTRY_TEST' ||
        !c.testName ||
        (r.testName ?? '').trim().toLowerCase() === c.testName.trim().toLowerCase()),
  );
}

/**
 * MERIT-3 / MARK-10: A = sum of (percentage x weight / 100), with a line-by-line breakdown.
 * Records below `minTrust` are not used; a required component without a usable record excludes
 * the applicant with a reason.
 */
export function computeAggregate(
  components: FormulaComponent[],
  records: MeritRecord[],
  minTrust = 0,
): AggregateResult {
  const breakdown: BreakdownLine[] = [];
  let reason: string | undefined;
  for (const c of components) {
    const label =
      c.type === 'ENTRY_TEST' && c.testName
        ? `${COMPONENT_LABELS[c.type]} (${c.testName})`
        : COMPONENT_LABELS[c.type];
    const rec = recordFor(c, records);
    if (!rec) {
      breakdown.push({
        component: c.type,
        label,
        percentage: null,
        weight: c.weight,
        contribution: 0,
        note: 'No result',
      });
      if (c.required) reason ??= `${label} result is missing`;
      continue;
    }
    if (rec.trustLevel < minTrust) {
      breakdown.push({
        component: c.type,
        label,
        percentage: rec.percentage,
        weight: c.weight,
        contribution: 0,
        note: 'Marks not verified',
      });
      reason ??= 'Marks not verified';
      continue;
    }
    if (c.minPercentage != null && rec.percentage < c.minPercentage) {
      breakdown.push({
        component: c.type,
        label,
        percentage: rec.percentage,
        weight: c.weight,
        contribution: round((rec.percentage * c.weight) / 100),
        note: `Below the minimum of ${c.minPercentage}%`,
      });
      reason ??= `${label} is below the minimum of ${c.minPercentage}%`;
      continue;
    }
    breakdown.push({
      component: c.type,
      label,
      percentage: rec.percentage,
      weight: c.weight,
      contribution: round((rec.percentage * c.weight) / 100),
    });
  }
  const aggregate = round(breakdown.reduce((s, b) => s + b.contribution, 0));
  return { ok: !reason, aggregate, breakdown, reason };
}

export interface Candidate {
  id: string;
  applicationNumber: string;
  dateOfBirth?: Date | string | null;
  /** Best percentage per qualification, used by the tie-breakers. */
  scores: Partial<Record<'ENTRY_TEST' | 'INTERMEDIATE' | 'MATRIC' | 'BACHELOR', number>>;
}

/**
 * MERIT-4: compares two candidates that have the same aggregate in a pool. Returns a negative
 * number when `a` ranks higher. The final tie-breaker is the application number.
 */
export function compareCandidates(
  a: Candidate & { aggregate: number },
  b: Candidate & { aggregate: number },
  tieBreakers: TieBreaker[],
): number {
  if (a.aggregate !== b.aggregate) return b.aggregate - a.aggregate;
  for (const t of tieBreakers) {
    if (t === 'YOUNGER') {
      const da = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
      const db = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
      if (da !== db) return db - da; // later birth date = younger = higher rank
      continue;
    }
    const sa = a.scores[t] ?? -1;
    const sb = b.scores[t] ?? -1;
    if (sa !== sb) return sb - sa;
  }
  return a.applicationNumber.localeCompare(b.applicationNumber);
}

export interface Pool {
  key: string;
  seats: number;
}

export interface AllocationApplicant extends Candidate {
  /** Pool keys in order of preference. */
  preferences: string[];
  /** Aggregate per pool key; a missing key means not eligible for that pool. */
  aggregates: Record<string, number>;
}

export interface AllocationResult {
  /** Applicant id -> pool key. */
  matched: Map<string, string>;
  /** Pool key -> applicant ids in merit order. */
  pools: Map<string, string[]>;
}

/**
 * MERIT-5: applicant-proposing deferred acceptance (Gale-Shapley) across program and shift pools.
 * Every applicant gets the highest preference that merit earns and no pool exceeds its seats.
 */
export function allocateSeats(
  applicants: AllocationApplicant[],
  pools: Pool[],
  tieBreakers: TieBreaker[] | ((pool: string) => TieBreaker[]),
): AllocationResult {
  const tb = typeof tieBreakers === 'function' ? tieBreakers : () => tieBreakers;
  const seats = new Map(pools.map((p) => [p.key, p.seats]));
  const held = new Map<string, AllocationApplicant[]>(pools.map((p) => [p.key, []]));
  const pointer = new Map<string, number>();
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const queue = [...applicants].sort((a, b) => a.applicationNumber.localeCompare(b.applicationNumber));

  const rank = (pool: string) => (x: AllocationApplicant, y: AllocationApplicant) =>
    compareCandidates(
      { ...x, aggregate: x.aggregates[pool]! },
      { ...y, aggregate: y.aggregates[pool]! },
      tb(pool),
    );

  while (queue.length) {
    const a = queue.shift()!;
    let i = pointer.get(a.id) ?? 0;
    // Step 2-3: move to the next preference the applicant is eligible for.
    while (i < a.preferences.length) {
      const key = a.preferences[i]!;
      if (seats.has(key) && (seats.get(key) ?? 0) > 0 && a.aggregates[key] !== undefined) break;
      i++;
    }
    pointer.set(a.id, i + 1);
    if (i >= a.preferences.length) continue; // no preference left: stays unmatched
    const key = a.preferences[i]!;
    const list = held.get(key)!;
    list.push(a);
    list.sort(rank(key));
    // Step 5: if the pool is over capacity, the lowest-ranked applicant proposes again.
    if (list.length > seats.get(key)!) {
      const out = list.pop()!;
      queue.push(byId.get(out.id)!);
    }
  }

  const matched = new Map<string, string>();
  const result = new Map<string, string[]>();
  for (const [key, list] of held) {
    result.set(
      key,
      list.map((x) => x.id),
    );
    for (const x of list) matched.set(x.id, key);
  }
  return { matched, pools: result };
}

/** Standard normal distribution function (Abramowitz-Stegun 7.1.26, error below 1.5e-7). */
export function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export const HISTORY_WEIGHTS = [0.5, 0.3, 0.2];

/**
 * PRED-5: chance from the closing merit of the last three years (latest first).
 * mu = sum(w x c), sigma = max(1, sqrt(sum(w x (c - mu)^2))); with one year sigma = 2.
 * Weights are normalised when fewer than three years are available.
 */
export function predictChance(aggregate: number, closings: number[]) {
  const c = closings.slice(0, 3);
  if (!c.length) return null;
  const w = HISTORY_WEIGHTS.slice(0, c.length);
  const sumW = w.reduce((s, x) => s + x, 0);
  const wn = w.map((x) => x / sumW);
  const mu = c.reduce((s, x, i) => s + wn[i]! * x, 0);
  const sigma =
    c.length === 1 ? 2 : Math.max(1, Math.sqrt(c.reduce((s, x, i) => s + wn[i]! * (x - mu) ** 2, 0)));
  const z = (aggregate - mu) / sigma;
  const raw = phi(z) * 100;
  const chance = Math.min(99, Math.max(1, Math.round(raw)));
  // PRED-6: classes.
  const band = chance >= 85 ? 'SAFE' : chance >= 50 ? 'TARGET' : chance >= 20 ? 'REACH' : 'UNLIKELY';
  return { mu: round(mu, 2), sigma: round(sigma, 2), z: round(z, 2), chance, band } as const;
}

/** FIND-3: next-list chance of a waiting-list position. */
export function waitlistChance(position: number, seats: number, declineRate = 0.1) {
  const v = Math.max(1, Math.round(seats * declineRate));
  return {
    expectedVacancies: v,
    chance: position <= v ? 'HIGH' : position <= 2 * v ? 'MEDIUM' : 'LOW',
  } as const;
}

/** OFFER-5: "Ayesha Noor" -> "Ayesha N."; CNICs and full names are never published. */
export function shortName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts
    .slice(1)
    .map((p) => `${p[0]!.toUpperCase()}.`)
    .join(' ')}`;
}
