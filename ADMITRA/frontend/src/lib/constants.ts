export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
] as const;

export const INSTITUTION_TYPES = { UNIVERSITY: 'University', COLLEGE: 'College', INSTITUTE: 'Institute' } as const;
export const SECTORS = { PUBLIC: 'Public', PRIVATE: 'Private' } as const;

export const DEGREE_LEVELS = {
  INTERMEDIATE: 'Intermediate',
  DIPLOMA: 'Diploma',
  ASSOCIATE: 'Associate Degree',
  BS: 'BS',
  MS: 'MS',
  MPHIL: 'MPhil',
  PHD: 'PhD',
} as const;

export const QUALIFICATION_LEVELS = {
  MATRIC: 'Matric / O-Level',
  INTERMEDIATE: 'Intermediate / A-Level',
  BACHELOR_14: "Bachelor's (14 years)",
  BACHELOR_16: "Bachelor's (16 years)",
  MASTER: "Master's",
  ENTRY_TEST: 'Entry test',
} as const;

export const SHIFTS = { MORNING: 'Morning', EVENING: 'Evening', WEEKEND: 'Weekend' } as const;

export const STAFF_ROLES = {
  INSTITUTION_ADMIN: 'Institution Admin',
  ADMISSION_OFFICER: 'Admission Officer',
  HOD_OFFICER: 'Department (HOD) Officer',
  FINANCE_OFFICER: 'Finance Officer',
  MERIT_COMMITTEE: 'Merit Committee',
} as const;

export type StaffRole = keyof typeof STAFF_ROLES;

export const CAMPAIGN_NEXT: Record<string, { to: string; label: string }[]> = {
  DRAFT: [{ to: 'OPEN', label: 'Open campaign' }],
  OPEN: [{ to: 'CLOSED', label: 'Close campaign' }],
  CLOSED: [
    { to: 'OPEN', label: 'Re-open' },
    { to: 'ARCHIVED', label: 'Archive' },
  ],
  ARCHIVED: [],
};

export const TRUST_LEVELS = {
  0: 'Declared',
  1: 'Document attached',
  2: 'Registry verified',
  3: 'Officer verified',
} as const;
