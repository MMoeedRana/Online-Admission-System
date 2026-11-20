import type { StaffRole } from './roles';

/**
 * Permission names checked on every protected endpoint (SEC-2).
 * Matches the role permission matrix (Table 2.4 of the proposal).
 */
export const PERMISSIONS = {
  INSTITUTION_SETTINGS: 'institution.settings',
  STRUCTURE_MANAGE: 'structure.manage',
  PROGRAMS_MANAGE: 'programs.manage',
  CAMPAIGNS_MANAGE: 'campaigns.manage',
  STAFF_MANAGE: 'staff.manage',
  DASHBOARD_VIEW: 'dashboard.view',
  STRUCTURE_VIEW: 'structure.view',
  APPLICATIONS_REVIEW: 'applications.review',
  MARKS_VERIFY: 'marks.verify',
  PAYMENTS_VERIFY: 'payments.verify',
  MERIT_MANAGE: 'merit.manage',
  MERIT_PUBLISH: 'merit.publish',
  ANALYTICS_VIEW: 'analytics.view',
  DIRECTORY_EDIT: 'directory.edit',
  SUPPORT_TICKETS: 'support.tickets',
  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  INSTITUTION_ADMIN: [
    P.INSTITUTION_SETTINGS,
    P.STRUCTURE_MANAGE,
    P.PROGRAMS_MANAGE,
    P.CAMPAIGNS_MANAGE,
    P.STAFF_MANAGE,
    P.DASHBOARD_VIEW,
    P.STRUCTURE_VIEW,
    P.APPLICATIONS_REVIEW,
    P.MARKS_VERIFY,
    P.PAYMENTS_VERIFY,
    P.MERIT_PUBLISH,
    P.ANALYTICS_VIEW,
    P.DIRECTORY_EDIT,
    P.SUPPORT_TICKETS,
    P.AUDIT_VIEW,
  ],
  ADMISSION_OFFICER: [P.DASHBOARD_VIEW, P.STRUCTURE_VIEW, P.APPLICATIONS_REVIEW, P.MARKS_VERIFY],
  HOD_OFFICER: [P.DASHBOARD_VIEW, P.STRUCTURE_VIEW, P.APPLICATIONS_REVIEW, P.MARKS_VERIFY],
  FINANCE_OFFICER: [P.DASHBOARD_VIEW, P.STRUCTURE_VIEW, P.PAYMENTS_VERIFY, P.ANALYTICS_VIEW],
  MERIT_COMMITTEE: [P.DASHBOARD_VIEW, P.STRUCTURE_VIEW, P.MERIT_MANAGE],
};

export function permissionsFor(roles: StaffRole[]): Permission[] {
  return [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []))];
}
