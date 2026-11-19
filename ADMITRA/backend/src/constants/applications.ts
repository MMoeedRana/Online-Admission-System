import type { Permission } from './permissions';
import { PERMISSIONS } from './permissions';

/** FLOW-1: statuses of an application (later statuses are used from Phase 3 onwards). */
export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PAYMENT_PENDING',
  'UNDER_REVIEW',
  'DOCUMENT_VERIFICATION',
  'DEFICIENT',
  'ELIGIBILITY_CHECK',
  'VERIFIED',
  'REJECTED',
  'OFFER_ISSUED',
  'WAITLISTED',
  'NOT_SELECTED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
  'ENROLLED',
  'WITHDRAWN',
  'REVOKED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Actor = 'APPLICANT' | 'STAFF' | 'SYSTEM';

export interface Transition {
  from: ApplicationStatus[];
  to: ApplicationStatus;
  actor: Actor;
  permission?: Permission;
  noteRequired?: boolean;
  label: string;
}

/** FLOW-2: the transition table checked on every status change. */
export const TRANSITIONS: Transition[] = [
  { from: ['DRAFT'], to: 'SUBMITTED', actor: 'APPLICANT', label: 'Submit application' },
  { from: ['SUBMITTED'], to: 'PAYMENT_PENDING', actor: 'SYSTEM', label: 'Fee challan issued' },
  { from: ['PAYMENT_PENDING'], to: 'UNDER_REVIEW', actor: 'SYSTEM', label: 'Fee verified' },
  {
    from: ['UNDER_REVIEW'],
    to: 'DOCUMENT_VERIFICATION',
    actor: 'STAFF',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    label: 'Start document verification',
  },
  {
    from: ['DOCUMENT_VERIFICATION', 'ELIGIBILITY_CHECK'],
    to: 'DEFICIENT',
    actor: 'STAFF',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    noteRequired: true,
    label: 'Send deficiency notice',
  },
  { from: ['DEFICIENT'], to: 'DOCUMENT_VERIFICATION', actor: 'APPLICANT', label: 'Resubmit corrections' },
  {
    from: ['DOCUMENT_VERIFICATION'],
    to: 'ELIGIBILITY_CHECK',
    actor: 'STAFF',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    label: 'Documents verified',
  },
  {
    from: ['DOCUMENT_VERIFICATION', 'ELIGIBILITY_CHECK'],
    to: 'VERIFIED',
    actor: 'STAFF',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    label: 'Mark verified',
  },
  {
    from: ['UNDER_REVIEW', 'DOCUMENT_VERIFICATION', 'DEFICIENT', 'ELIGIBILITY_CHECK'],
    to: 'REJECTED',
    actor: 'STAFF',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    noteRequired: true,
    label: 'Reject application',
  },
  {
    from: [
      'DRAFT',
      'SUBMITTED',
      'PAYMENT_PENDING',
      'UNDER_REVIEW',
      'DOCUMENT_VERIFICATION',
      'DEFICIENT',
      'ELIGIBILITY_CHECK',
      'VERIFIED',
    ],
    to: 'WITHDRAWN',
    actor: 'APPLICANT',
    label: 'Withdraw application',
  },
];

/** Statuses in which an applicant counts as having an active application in a campaign (APP-2). */
export const ACTIVE_STATUSES: ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'PAYMENT_PENDING',
  'UNDER_REVIEW',
  'DOCUMENT_VERIFICATION',
  'DEFICIENT',
  'ELIGIBILITY_CHECK',
  'VERIFIED',
  'OFFER_ISSUED',
  'WAITLISTED',
];

export const DOCUMENT_FORMATS = ['PDF', 'JPG', 'PNG'] as const;
export const MIME_BY_FORMAT: Record<(typeof DOCUMENT_FORMATS)[number], string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png',
};

export const PAYMENT_METHODS = ['BANK_DEPOSIT', 'ONLINE_TRANSFER', 'EASYPAISA', 'JAZZCASH'] as const;
