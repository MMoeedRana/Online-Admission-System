import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  green: 'bg-green-50 text-green-700 ring-green-600/15 dark:bg-green-500/10 dark:text-green-400',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-400',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-500/15 dark:text-slate-300',
};
export type Tone = keyof typeof tones;

export function Badge({
  tone = 'gray',
  dot = true,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [Tone, string]> = {
  ACTIVE: ['green', 'Active'],
  PENDING: ['amber', 'Pending'],
  SUSPENDED: ['red', 'Suspended'],
  REJECTED: ['red', 'Rejected'],
  INVITED: ['amber', 'Invited'],
  DISABLED: ['gray', 'Disabled'],
  DRAFT: ['gray', 'Draft'],
  OPEN: ['green', 'Open'],
  CLOSED: ['amber', 'Closed'],
  ARCHIVED: ['gray', 'Archived'],
  RETIRED: ['gray', 'Retired'],
  GRACE: ['amber', 'Grace period'],
  READ_ONLY: ['red', 'Read-only'],
  NONE: ['gray', 'No subscription'],
  // applications (FLOW-1)
  SUBMITTED: ['blue', 'Submitted'],
  PAYMENT_PENDING: ['amber', 'Payment pending'],
  UNDER_REVIEW: ['blue', 'Under review'],
  DOCUMENT_VERIFICATION: ['purple', 'Document verification'],
  DEFICIENT: ['red', 'Deficient'],
  ELIGIBILITY_CHECK: ['purple', 'Eligibility check'],
  VERIFIED: ['green', 'Verified'],
  WITHDRAWN: ['gray', 'Withdrawn'],
  // challans and payments
  ISSUED: ['amber', 'Awaiting payment'],
  AWAITING_VERIFICATION: ['amber', 'Awaiting verification'],
  PAID: ['green', 'Paid'],
  CANCELLED: ['gray', 'Cancelled'],
  EXPIRED: ['red', 'Expired'],
  APPROVED: ['green', 'Approved'],
  UPLOADED: ['blue', 'Uploaded'],
  ROLLED_BACK: ['gray', 'Rolled back'],
  // merit lists, offers and enrollment (Phase 3)
  PUBLISHED: ['green', 'Published'],
  SUPERSEDED: ['gray', 'Superseded'],
  DISCARDED: ['gray', 'Discarded'],
  OFFER_ISSUED: ['green', 'Offer issued'],
  WAITLISTED: ['amber', 'Waiting list'],
  NOT_SELECTED: ['gray', 'Not selected'],
  OFFER_DECLINED: ['gray', 'Offer declined'],
  OFFER_EXPIRED: ['red', 'Offer expired'],
  ENROLLED: ['green', 'Enrolled'],
  REVOKED: ['red', 'Revoked'],
  OFFERED: ['blue', 'Offered'],
  ACCEPTED: ['purple', 'Accepted'],
  DECLINED: ['gray', 'Declined'],
  PENDING_ORIGINALS: ['amber', 'Originals pending'],
  SELECTED: ['green', 'Selected'],
  // support tickets (Phase 4)
  IN_PROGRESS: ['purple', 'In progress'],
  WAITING_ON_INSTITUTION: ['amber', 'Waiting on institution'],
  RESOLVED: ['green', 'Resolved'],
};

/** Marks verification state of an academic record (MARK-3). */
const RECORD: Record<string, [Tone, string]> = {
  DECLARED: ['gray', 'Self-declared'],
  UNDER_VERIFICATION: ['amber', 'Needs officer review'],
  AUTO_VERIFIED: ['green', 'Registry verified'],
  VERIFIED: ['green', 'Officer verified'],
  MISMATCH: ['red', 'Mismatch'],
  FRAUD_FLAGGED: ['red', 'Fraud flag'],
  SUPERSEDED: ['gray', 'Old version'],
};

export function RecordBadge({ status }: { status: string }) {
  const [tone, text] = RECORD[status] ?? ['gray', status];
  return <Badge tone={tone}>{text}</Badge>;
}

/** Summary of an applicant's marks in staff lists. */
const MARKS: Record<string, [Tone, string]> = {
  VERIFIED: ['green', 'Verified'],
  PENDING: ['amber', 'Not in registry'],
  MISMATCH: ['red', 'Mismatch'],
  NONE: ['gray', 'No records'],
  FLAGGED: ['red', 'Fraud flag'],
};

export function MarksBadge({ state }: { state: string }) {
  const [tone, text] = MARKS[state] ?? ['gray', state];
  return <Badge tone={tone}>{text}</Badge>;
}

/** Trust level 0-3 as a numbered chip (Section 4.1.1). */
export function TrustChip({ level }: { level: number }) {
  const tones = [
    'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
    'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
    'bg-green-600 text-white',
  ];
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
        tones[level] ?? tones[0],
      )}
    >
      {level}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [tone, text] = STATUS[status] ?? ['gray', status];
  return <Badge tone={tone}>{label ?? text}</Badge>;
}
