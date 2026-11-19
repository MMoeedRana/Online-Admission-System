/** Examination boards and universities offered in the academic record form. */
export const BOARDS = [
  'BISE Lahore',
  'BISE Faisalabad',
  'BISE Gujranwala',
  'BISE Multan',
  'BISE Rawalpindi',
  'BISE Sargodha',
  'BISE Sahiwal',
  'BISE Bahawalpur',
  'BISE Dera Ghazi Khan',
  'Federal Board (FBISE)',
  'BIEK Karachi',
  'BSEK Karachi',
  'BISE Hyderabad',
  'BISE Sukkur',
  'BISE Peshawar',
  'BISE Mardan',
  'BISE Abbottabad',
  'BISE Quetta',
  'BISE Mirpur (AJK)',
  'Aga Khan University Examination Board',
  'Cambridge (IBCC equivalence)',
  'University',
  'Other',
] as const;

export const RECORD_LEVELS = [
  'MATRIC',
  'INTERMEDIATE',
  'BACHELOR_14',
  'BACHELOR_16',
  'MASTER',
  'ENTRY_TEST',
] as const;
export type RecordLevel = (typeof RECORD_LEVELS)[number];

export const EXAM_TYPES = ['ANNUAL', 'SUPPLEMENTARY', 'SEMESTER', 'TEST'] as const;

/**
 * MARK-2: standard grand totals per level. A record whose total is not one of these is flagged
 * for the officer (it is not rejected, because some boards and years use other totals).
 * Bachelor, Master and entry tests vary by university, so they have no fixed standard.
 */
export const STANDARD_TOTALS: Partial<
  Record<RecordLevel, { fromYear: number; toYear: number; totals: number[] }[]>
> = {
  MATRIC: [
    { fromYear: 1990, toYear: 2023, totals: [1050, 1100] },
    { fromYear: 2024, toYear: 2100, totals: [1100, 1200] },
  ],
  INTERMEDIATE: [
    { fromYear: 1990, toYear: 2023, totals: [1100] },
    { fromYear: 2024, toYear: 2100, totals: [1100, 1200] },
  ],
};

export function standardTotalsFor(level: RecordLevel, year: number): number[] | null {
  const rows = STANDARD_TOTALS[level];
  if (!rows) return null;
  return rows.find((r) => year >= r.fromYear && year <= r.toYear)?.totals ?? null;
}

/** MARK-3 trust levels. */
export const TRUST = { DECLARED: 0, DOCUMENT: 1, REGISTRY: 2, OFFICER: 3 } as const;

export const VERIFICATION_STATUSES = [
  'DECLARED',
  'AUTO_VERIFIED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'MISMATCH',
  'FRAUD_FLAGGED',
  'SUPERSEDED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** MARK-4: minimum similarity of names for a registry match. */
export const NAME_SIMILARITY = 0.9;
