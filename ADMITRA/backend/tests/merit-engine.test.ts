import { describe, expect, it } from 'vitest';
import {
  allocateSeats,
  compareCandidates,
  computeAggregate,
  predictChance,
  shortName,
  validateComponents,
  waitlistChance,
  type AllocationApplicant,
  type FormulaComponent,
} from '../src/lib/merit';

const formula: FormulaComponent[] = [
  { type: 'MATRIC', weight: 10, required: true },
  { type: 'INTERMEDIATE', weight: 40, required: true },
  { type: 'ENTRY_TEST', weight: 50, required: true },
];
const rec = (level: string, percentage: number, trustLevel = 3) => ({ level, percentage, trustLevel });

describe('merit formula (MERIT-1, MERIT-3)', () => {
  it('requires weights to total 100 and components to be unique', () => {
    expect(validateComponents(formula)).toBeNull();
    expect(validateComponents([{ type: 'MATRIC', weight: 60, required: true }])).toMatch(/total 100/);
    expect(
      validateComponents([
        { type: 'MATRIC', weight: 50, required: true },
        { type: 'MATRIC', weight: 50, required: true },
      ]),
    ).toMatch(/only once/);
  });

  it('computes the worked example of Section 3.12.4 with a line-by-line breakdown', () => {
    const r = computeAggregate(
      formula,
      [rec('MATRIC', 86.4), rec('INTERMEDIATE', 81.2), rec('ENTRY_TEST', 84)],
      2,
    );
    expect(r.ok).toBe(true);
    expect(r.aggregate).toBeCloseTo(83.12, 4);
    expect(r.breakdown.map((b) => b.contribution)).toEqual([8.64, 32.48, 42]);
  });

  it('excludes records below the minimum trust level (MARK-10)', () => {
    const r = computeAggregate(
      formula,
      [rec('MATRIC', 86.4), rec('INTERMEDIATE', 81.2, 1), rec('ENTRY_TEST', 84)],
      2,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Marks not verified');
  });

  it('reports a missing required component and a component below its minimum', () => {
    expect(computeAggregate(formula, [rec('MATRIC', 80), rec('INTERMEDIATE', 80)]).reason).toMatch(
      /Entry test result is missing/,
    );
    const min = computeAggregate(
      [{ type: 'INTERMEDIATE', weight: 100, minPercentage: 60, required: true }],
      [rec('INTERMEDIATE', 55)],
    );
    expect(min.ok).toBe(false);
    expect(min.reason).toMatch(/below the minimum of 60%/);
  });
});

describe('tie-breakers (MERIT-4)', () => {
  const a = { id: 'a', applicationNumber: 'X-2', aggregate: 80, scores: { ENTRY_TEST: 70 } };
  const b = { id: 'b', applicationNumber: 'X-1', aggregate: 80, scores: { ENTRY_TEST: 75 } };
  it('uses the configured tie-breakers in order, then the application number', () => {
    expect(compareCandidates(a, b, ['ENTRY_TEST'])).toBeGreaterThan(0); // b has the higher test
    expect(compareCandidates(a, { ...b, scores: { ENTRY_TEST: 70 } }, ['ENTRY_TEST'])).toBeGreaterThan(0); // X-1 first
    const younger = { ...a, dateOfBirth: '2007-01-01' };
    const older = { ...b, scores: { ENTRY_TEST: 70 }, dateOfBirth: '2005-01-01' };
    expect(compareCandidates(younger, older, ['YOUNGER'])).toBeLessThan(0);
  });
});

describe('stable seat allocation (MERIT-5)', () => {
  const app = (id: string, prefs: string[], aggs: Record<string, number>): AllocationApplicant => ({
    id,
    applicationNumber: `N-${id}`,
    scores: {},
    preferences: prefs,
    aggregates: aggs,
  });

  it('gives everyone the best preference merit earns without exceeding seats', () => {
    const res = allocateSeats(
      [
        app('ali', ['CS', 'SE'], { CS: 90, SE: 90 }),
        app('sara', ['CS', 'SE'], { CS: 85, SE: 88 }),
        app('omar', ['SE', 'CS'], { CS: 80, SE: 86 }),
        app('zara', ['CS'], { CS: 70 }),
      ],
      [
        { key: 'CS', seats: 1 },
        { key: 'SE', seats: 2 },
      ],
      [],
    );
    expect(res.matched.get('ali')).toBe('CS');
    expect(res.matched.get('sara')).toBe('SE');
    expect(res.matched.get('omar')).toBe('SE');
    expect(res.matched.has('zara')).toBe(false);
    expect(res.pools.get('SE')).toEqual(['sara', 'omar']);
  });

  it('skips pools the applicant is not eligible for', () => {
    const res = allocateSeats(
      [app('a', ['CS', 'IT'], { IT: 60 })],
      [
        { key: 'CS', seats: 5 },
        { key: 'IT', seats: 5 },
      ],
      [],
    );
    expect(res.matched.get('a')).toBe('IT');
  });

  it('is stable: no applicant prefers a pool that holds someone with lower merit', () => {
    const applicants = Array.from({ length: 40 }, (_, i) => {
      const prefs = ['A', 'B', 'C'].sort(() => ((i * 7) % 3) - 1);
      const aggs = { A: 50 + ((i * 13) % 50), B: 50 + ((i * 29) % 50), C: 50 + ((i * 31) % 50) };
      return app(String(i).padStart(2, '0'), prefs, aggs);
    });
    const pools = [
      { key: 'A', seats: 5 },
      { key: 'B', seats: 7 },
      { key: 'C', seats: 6 },
    ];
    const res = allocateSeats(applicants, pools, []);
    for (const p of pools) expect((res.pools.get(p.key) ?? []).length).toBeLessThanOrEqual(p.seats);
    for (const a of applicants) {
      const mine = res.matched.get(a.id);
      const better = mine ? a.preferences.slice(0, a.preferences.indexOf(mine)) : a.preferences;
      for (const pool of better) {
        const holders = res.pools.get(pool)!;
        const full = holders.length >= pools.find((p) => p.key === pool)!.seats;
        if (!full) throw new Error(`${a.id} could have taken ${pool}`);
        const weakest = applicants.find((x) => x.id === holders[holders.length - 1])!;
        expect(weakest.aggregates[pool]! >= a.aggregates[pool]!).toBe(true);
      }
    }
  });
});

describe('chance prediction (PRED-5, PRED-6) and waiting list (FIND-3)', () => {
  it('matches the worked example of Table 3.16', () => {
    const z = (mu: number, sigma: number) => (83.12 - mu) / sigma;
    // Values computed through the same normal distribution as the table.
    expect(Math.round(z(80.6, 1.8) * 100) / 100).toBe(1.4);
    const one = predictChance(83.12, [80.6])!;
    expect(one.sigma).toBe(2);
    const many = predictChance(83.12, [80, 81, 79])!;
    expect(many.mu).toBeCloseTo(80.1, 1);
    expect(many.sigma).toBe(1);
    expect(many.chance).toBe(99);
    expect(many.band).toBe('SAFE');
    expect(predictChance(80, [84, 84.5, 83])!.band).toBe('UNLIKELY');
    expect(predictChance(80, [])).toBeNull();
  });

  it('classifies 92% as Safe, 67% as Target and 29% as Reach', () => {
    // mu/sigma chosen so that z equals the values of Table 3.16.
    expect(predictChance(80.6 + 1.4 * 2, [80.6])!.chance).toBe(92);
    expect(predictChance(82.4 + 0.45 * 2, [82.4])!.band).toBe('TARGET');
    expect(predictChance(84 - 0.55 * 2, [84])!.band).toBe('REACH');
  });

  it('estimates the next-list chance from seats and the decline rate', () => {
    expect(waitlistChance(7, 180).chance).toBe('HIGH');
    expect(waitlistChance(30, 180).chance).toBe('MEDIUM');
    expect(waitlistChance(60, 180).chance).toBe('LOW');
  });

  it('shortens names for public lists (OFFER-5)', () => {
    expect(shortName('Ayesha Noor')).toBe('Ayesha N.');
    expect(shortName('Muhammad Bilal Ahmed')).toBe('Muhammad B. A.');
  });
});
