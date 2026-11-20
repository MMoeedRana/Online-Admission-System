import { Schema, Types, model, type InferSchemaType } from 'mongoose';

/** SUP-1: categories, priorities with response targets (hours) and statuses of a ticket. */
export const TICKET_CATEGORIES = [
  'TECHNICAL',
  'BILLING',
  'ACCOUNT_ACCESS',
  'DATA_CORRECTION',
  'FEATURE_REQUEST',
  'OTHER',
] as const;
export const TICKET_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const RESPONSE_TARGET_HOURS: Record<TicketPriority, number> = {
  URGENT: 2,
  HIGH: 8,
  NORMAL: 24,
  LOW: 72,
};
export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_INSTITUTION',
  'RESOLVED',
  'CLOSED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const messageSchema = new Schema(
  {
    authorId: { type: Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    /** Which side wrote the message: the institution or the platform team. */
    side: { type: String, enum: ['INSTITUTION', 'PLATFORM'], required: true },
    body: { type: String, required: true, maxlength: 5000 },
    /** Status set together with this reply, if any. */
    statusChange: { type: String, enum: [...TICKET_STATUSES, null], default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const ticketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    openedBy: { type: Types.ObjectId, ref: 'User', required: true },
    openedByName: { type: String, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    category: { type: String, enum: TICKET_CATEGORIES, required: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'NORMAL' },
    status: { type: String, enum: TICKET_STATUSES, default: 'OPEN', index: true },
    /** Time by which the platform team should first reply (SUP-1). */
    responseDueAt: { type: Date, required: true },
    firstResponseAt: { type: Date, default: null },
    assignedTo: { type: Types.ObjectId, ref: 'User', default: null },
    assignedToName: { type: String, default: '' },
    messages: [messageSchema],
    lastActivityAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
ticketSchema.index({ institutionId: 1, status: 1, lastActivityAt: -1 });
export type SupportTicket = InferSchemaType<typeof ticketSchema>;
export const SupportTicketModel = model('SupportTicket', ticketSchema);

export function responseDue(priority: TicketPriority, from = new Date()): Date {
  return new Date(from.getTime() + RESPONSE_TARGET_HOURS[priority] * 60 * 60 * 1000);
}

/** Whether the first platform reply is late (or will be late if nobody replies now). */
export function responseState(t: { responseDueAt: Date; firstResponseAt?: Date | null; status: string }) {
  if (t.firstResponseAt) return t.firstResponseAt <= t.responseDueAt ? 'MET' : 'MISSED';
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') return 'MET';
  return Date.now() > t.responseDueAt.getTime() ? 'OVERDUE' : 'DUE';
}
