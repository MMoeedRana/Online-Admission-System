/** Intermediate / A-level groups offered by the Admission Advisor (PRED-1). */
export const INTER_GROUPS = [
  'Pre-Engineering',
  'Pre-Medical',
  'Pre-Medical (with Mathematics)',
  'ICS',
  'I.Com',
  'FA',
  'FA (IT)',
  'General Science',
  'A-Level',
] as const;

/** PRED-4: used when the weights of a program are not known (labelled "standard formula"). */
export const STANDARD_FORMULA_WITH_TEST = [
  { component: 'MATRIC', weight: 10 },
  { component: 'INTERMEDIATE', weight: 40 },
  { component: 'ENTRY_TEST', weight: 50 },
] as const;
export const STANDARD_FORMULA_NO_TEST = [
  { component: 'MATRIC', weight: 30 },
  { component: 'INTERMEDIATE', weight: 70 },
] as const;

/** PRED-8: shown with every advisor result. */
export const ADVISOR_NOTICE =
  'This is a statistical estimate from past merit lists, not a guarantee of admission. Seats, formulas and the applicant pool change every year.';
