export const ACCOUNT_TYPES = ['APPLICANT', 'STAFF', 'PLATFORM'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PLATFORM_ROLES = ['SUPER_ADMIN'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const STAFF_ROLES = [
  'INSTITUTION_ADMIN',
  'ADMISSION_OFFICER',
  'HOD_OFFICER',
  'FINANCE_OFFICER',
  'MERIT_COMMITTEE',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  INSTITUTION_ADMIN: 'Institution Admin',
  ADMISSION_OFFICER: 'Admission Officer',
  HOD_OFFICER: 'Department (HOD) Officer',
  FINANCE_OFFICER: 'Finance Officer',
  MERIT_COMMITTEE: 'Merit Committee',
};
