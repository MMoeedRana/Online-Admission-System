import type { Tone } from '@/components/ui/badge';

export type Side = 'institution' | 'platform';

export interface TicketMessage {
  _id: string;
  authorId: string;
  authorName: string;
  side: 'INSTITUTION' | 'PLATFORM';
  body: string;
  statusChange: string | null;
  createdAt: string;
}

export interface Ticket {
  _id: string;
  ticketNumber: string;
  institutionId: string;
  openedByName: string;
  subject: string;
  category: keyof typeof CATEGORIES;
  priority: keyof typeof PRIORITIES;
  status: keyof typeof TICKET_STATUS;
  responseDueAt: string;
  firstResponseAt: string | null;
  responseState: keyof typeof RESPONSE;
  assignedToName: string;
  messageCount: number;
  messages?: TicketMessage[];
  lastActivityAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  institution?: {
    _id: string;
    name: string;
    shortName?: string;
    city?: string;
    contact?: { name: string; email: string; phone?: string };
  } | null;
}

export const CATEGORIES = {
  TECHNICAL: 'Technical problem',
  BILLING: 'Billing and plan',
  ACCOUNT_ACCESS: 'Account and access',
  DATA_CORRECTION: 'Data correction',
  FEATURE_REQUEST: 'Feature request',
  OTHER: 'Other',
} as const;

export const PRIORITIES = {
  URGENT: { label: 'Urgent', hours: 2, tone: 'red' as Tone },
  HIGH: { label: 'High', hours: 8, tone: 'amber' as Tone },
  NORMAL: { label: 'Normal', hours: 24, tone: 'blue' as Tone },
  LOW: { label: 'Low', hours: 72, tone: 'gray' as Tone },
} as const;

export const TICKET_STATUS = {
  OPEN: { label: 'Open', tone: 'blue' as Tone },
  IN_PROGRESS: { label: 'In progress', tone: 'purple' as Tone },
  WAITING_ON_INSTITUTION: { label: 'Waiting on institution', tone: 'amber' as Tone },
  RESOLVED: { label: 'Resolved', tone: 'green' as Tone },
  CLOSED: { label: 'Closed', tone: 'gray' as Tone },
} as const;

export const RESPONSE = {
  DUE: { label: 'Response due', tone: 'blue' as Tone },
  OVERDUE: { label: 'Response overdue', tone: 'red' as Tone },
  MET: { label: 'Target met', tone: 'green' as Tone },
  MISSED: { label: 'Target missed', tone: 'amber' as Tone },
} as const;

export const base = (side: Side) => (side === 'platform' ? '/platform/support' : '/support/tickets');
export const pageBase = (side: Side) => (side === 'platform' ? '/platform/support' : '/institution/support');

export function relative(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const h = abs / 3600_000;
  const text =
    h < 1 ? `${Math.max(1, Math.round(abs / 60_000))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
