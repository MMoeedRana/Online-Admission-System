import type { Request } from 'express';
import type { HydratedDocument } from 'mongoose';
import { env } from '../../config/env';
import { audit } from '../../lib/audit';
import { nextSeq, pad } from '../../lib/counter';
import { ApiError } from '../../lib/http';
import { sendMail } from '../../lib/mailer';
import type { Id } from '../../lib/types';
import { InstitutionModel } from '../institutions/institution.model';
import { notify } from '../notifications/notify';
import { MemberModel } from '../staff/member.model';
import { UserModel } from '../users/user.model';
import {
  responseDue,
  responseState,
  SupportTicketModel,
  TICKET_CATEGORIES,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from './support.model';
import { brand } from '../../lib/brand';

type Ticket = HydratedDocument<SupportTicket>;

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const PLATFORM_STATUSES: TicketStatus[] = [
  'IN_PROGRESS',
  'WAITING_ON_INSTITUTION',
  'RESOLVED',
  'CLOSED',
];
export const INSTITUTION_STATUSES: TicketStatus[] = ['OPEN', 'CLOSED'];

export function view(t: Ticket | Record<string, unknown>, withMessages = true) {
  const o = ('toObject' in t && typeof t.toObject === 'function' ? t.toObject() : t) as Record<
    string,
    unknown
  > & {
    messages: unknown[];
    responseDueAt: Date;
    firstResponseAt: Date | null;
    status: string;
  };
  const { messages, ...rest } = o;
  return {
    ...rest,
    messageCount: messages.length,
    responseState: responseState(o),
    ...(withMessages ? { messages } : {}),
  };
}

async function platformTeam() {
  return UserModel.find({ platformRole: 'SUPER_ADMIN', status: 'ACTIVE' }).select('email fullName').lean();
}

async function institutionContacts(t: Ticket) {
  const admins = await MemberModel.find({
    institutionId: t.institutionId,
    status: 'ACTIVE',
    roles: 'INSTITUTION_ADMIN',
  }).distinct('userId');
  const ids = [...new Set([String(t.openedBy), ...admins.filter(Boolean).map(String)])];
  return UserModel.find({ _id: { $in: ids }, status: 'ACTIVE' })
    .select('email fullName')
    .lean();
}

async function tellOtherSide(t: Ticket, fromSide: 'INSTITUTION' | 'PLATFORM', title: string, body: string) {
  const inst = await InstitutionModel.findById(t.institutionId).select('name').lean();
  const recipients = fromSide === 'INSTITUTION' ? await platformTeam() : await institutionContacts(t);
  const link = fromSide === 'INSTITUTION' ? `/platform/support/${t._id}` : `/institution/support/${t._id}`;
  await Promise.all(
    recipients.map(async (u) => {
      await notify(u._id, { type: 'SUPPORT', title, body, link });
      await sendMail({
        to: u.email,
        subject: `[${t.ticketNumber}] ${t.subject}`,
        heading: escapeHtml(title),
        paragraphs: [escapeHtml(`${inst?.name ?? 'Institution'}: ${body}`)],
        action: { label: 'Open the ticket', url: `${env.WEB_URL}${link}` },
      });
    }),
  );
}

export async function openTicket(
  req: Request,
  b: {
    subject: string;
    category: (typeof TICKET_CATEGORIES)[number];
    priority: TicketPriority;
    message: string;
  },
) {
  const year = new Date().getFullYear();
  const ticket = await SupportTicketModel.create({
    ticketNumber: `TKT-${year}-${pad(await nextSeq(`ticket:${year}`), 5)}`,
    institutionId: req.tenant!.institutionId,
    openedBy: req.auth!.userId,
    openedByName: req.auth!.name,
    subject: b.subject,
    category: b.category,
    priority: b.priority,
    responseDueAt: responseDue(b.priority),
    messages: [
      { authorId: req.auth!.userId, authorName: req.auth!.name, side: 'INSTITUTION', body: b.message },
    ],
  });
  await audit(req, 'SUPPORT_TICKET_OPENED', 'SupportTicket', ticket._id, {
    ticketNumber: ticket.ticketNumber,
    priority: b.priority,
    category: b.category,
  });
  await tellOtherSide(
    ticket,
    'INSTITUTION',
    `New ${b.priority.toLowerCase()} ticket ${ticket.ticketNumber}`,
    b.subject,
  );
  return ticket;
}

export async function reply(
  req: Request,
  id: Id,
  side: 'INSTITUTION' | 'PLATFORM',
  b: { message: string; status?: TicketStatus },
  scope: Record<string, unknown> = {},
) {
  const t = await SupportTicketModel.findOne({ _id: id, ...scope });
  if (!t) throw ApiError.notFound('Ticket');
  if (t.status === 'CLOSED' && side === 'PLATFORM') throw ApiError.conflict('This ticket is closed.');
  let status = b.status ?? null;
  if (status && !(side === 'PLATFORM' ? PLATFORM_STATUSES : INSTITUTION_STATUSES).includes(status))
    throw ApiError.badRequest('This status cannot be set from here.');
  if (
    side === 'INSTITUTION' &&
    !status &&
    ['WAITING_ON_INSTITUTION', 'RESOLVED', 'CLOSED'].includes(t.status)
  )
    status = 'OPEN';
  if (side === 'PLATFORM' && !status && t.status === 'OPEN') status = 'IN_PROGRESS';
  t.messages.push({
    authorId: req.auth!.userId,
    authorName: req.auth!.name,
    side,
    body: b.message,
    statusChange: status && status !== t.status ? status : null,
  });
  if (side === 'PLATFORM' && !t.firstResponseAt) t.firstResponseAt = new Date();
  if (status) applyStatus(t, status);
  t.lastActivityAt = new Date();
  await t.save();
  await audit(
    req,
    'SUPPORT_TICKET_REPLIED',
    'SupportTicket',
    t._id,
    { side, status: t.status },
    {
      institutionId: t.institutionId as Id,
    },
  );
  await tellOtherSide(
    t,
    side,
    `${side === 'PLATFORM' ? `${brand().platformName} support` : req.auth!.name} replied to ${t.ticketNumber}`,
    b.message.length > 160 ? `${b.message.slice(0, 157)}...` : b.message,
  );
  return t;
}

export function applyStatus(t: Ticket, status: TicketStatus) {
  t.status = status;
  if (status === 'RESOLVED') t.resolvedAt = new Date();
  if (status === 'CLOSED') t.closedAt = new Date();
  if (status === 'OPEN' || status === 'IN_PROGRESS') {
    t.resolvedAt = null;
    t.closedAt = null;
  }
}
