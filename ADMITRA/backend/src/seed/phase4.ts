import type { Types } from 'mongoose';
import { nextSeq, pad } from '../lib/counter';
import { ApplicationModel } from '../modules/applications/application.model';
import { AuditLogModel } from '../modules/audit/audit.model';
import { CampaignModel } from '../modules/campaigns/campaign.model';
import { PaymentModel } from '../modules/fees/fee.models';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { NotificationModel } from '../modules/notifications/notification.models';
import { PlanModel } from '../modules/plans/plan.model';
import { ProgramModel } from '../modules/programs/program.model';
import { MemberModel } from '../modules/staff/member.model';
import {
  RESPONSE_TARGET_HOURS,
  SupportTicketModel,
  TICKET_CATEGORIES,
  type TicketPriority,
  type TicketStatus,
} from '../modules/support/support.model';
import { UserModel } from '../modules/users/user.model';
import { DAY, HOUR, realNow } from './clock';

const log = (msg: string) => console.log(`  ${msg}`);
const IP = '127.0.0.1';

async function seedSetupAudit(superAdmin: { _id: Types.ObjectId; fullName: string }) {
  const rows: Record<string, unknown>[] = [];
  const add = (r: Record<string, unknown>) => rows.push({ ip: IP, ...r });
  for (const p of await PlanModel.find().lean())
    add({
      actorId: superAdmin._id,
      actorName: superAdmin.fullName,
      action: 'PLAN_CREATED',
      entity: 'SubscriptionPlan',
      entityId: String(p._id),
      changes: { code: p.code, name: p.name },
      createdAt: p.createdAt,
    });

  for (const inst of await InstitutionModel.find({ status: 'ACTIVE' }).lean()) {
    const plan = await PlanModel.findById(inst.planId).select('code').lean();
    const firstCampaign = await CampaignModel.findOne({ institutionId: inst._id })
      .sort({ opensAt: 1 })
      .lean();
    const start = Math.min(
      inst.createdAt.getTime(),
      (firstCampaign?.opensAt.getTime() ?? Date.now()) - 12 * DAY,
    );
    add({
      actorId: superAdmin._id,
      actorName: superAdmin.fullName,
      institutionId: inst._id,
      action: 'INSTITUTION_APPROVED',
      entity: 'Institution',
      entityId: String(inst._id),
      changes: { plan: plan?.code ?? '', trialDays: 0 },
      createdAt: new Date(start + HOUR),
    });
    const members = await MemberModel.find({ institutionId: inst._id }).lean();
    const adminMember = members.find((m) => m.roles.includes('INSTITUTION_ADMIN'));
    const admin = adminMember?.userId
      ? await UserModel.findById(adminMember.userId).select('fullName').lean()
      : null;
    const by = { actorId: admin?._id ?? null, actorName: admin?.fullName ?? '', institutionId: inst._id };
    members
      .filter((m) => m !== adminMember)
      .forEach((m, i) =>
        add({
          ...by,
          action: 'STAFF_INVITED',
          entity: 'InstitutionMember',
          entityId: String(m._id),
          changes: { email: m.email, roles: m.roles },
          createdAt: new Date(start + 2 * HOUR + i * 600_000),
        }),
      );
    const programs = await ProgramModel.find({ institutionId: inst._id }).lean();
    programs.forEach((p, i) =>
      add({
        ...by,
        action: 'PROGRAM_CREATED',
        entity: 'Program',
        entityId: String(p._id),
        changes: { title: p.title, code: p.code },
        createdAt: new Date(start + 4 * HOUR + i * 900_000),
      }),
    );
    for (const c of await CampaignModel.find({ institutionId: inst._id }).lean()) {
      add({
        ...by,
        action: 'CAMPAIGN_CREATED',
        entity: 'AdmissionCampaign',
        entityId: String(c._id),
        changes: { title: c.title, code: c.code },
        createdAt: new Date(c.opensAt.getTime() - 2 * DAY),
      });
      for (const h of c.history ?? [])
        add({
          ...by,
          action: 'CAMPAIGN_STATUS_CHANGED',
          entity: 'AdmissionCampaign',
          entityId: String(c._id),
          changes: { to: h.to },
          createdAt: h.at,
        });
    }
  }

  const apps = await ApplicationModel.find({ 'history.actor': 'STAFF' })
    .select('institutionId history')
    .lean();
  for (const a of apps)
    for (const h of a.history.filter((x) => x.actor === 'STAFF'))
      add({
        actorId: h.by ?? null,
        actorName: h.byName ?? '',
        institutionId: a.institutionId,
        action: 'APPLICATION_STATUS_CHANGED',
        entity: 'Application',
        entityId: String(a._id),
        changes: { to: h.to, note: h.note ?? '' },
        createdAt: h.at,
      });

  const logged = new Set((await AuditLogModel.find({ entity: 'Payment' }).distinct('entityId')).map(String));
  for (const p of await PaymentModel.find({ status: { $ne: 'PENDING' } }).lean())
    if (!logged.has(String(p._id)))
      add({
        actorId: p.decidedBy ?? null,
        actorName: p.decidedByName ?? '',
        institutionId: p.institutionId,
        action: `PAYMENT_${p.status}`,
        entity: 'Payment',
        entityId: String(p._id),
        changes: { receipt: p.receiptNumber ?? null, reason: p.reason || undefined },
        createdAt: p.decidedAt ?? p.updatedAt,
      });

  await AuditLogModel.insertMany(rows);
  log(`Audit log: ${rows.length} set-up and review entries`);
}

interface SampleTicket {
  inst: string;
  by: string;
  subject: string;
  category: (typeof TICKET_CATEGORIES)[number];
  priority: TicketPriority;
  hoursAgo: number;
  thread: { side: 'INSTITUTION' | 'PLATFORM'; body: string; afterHours: number; status?: TicketStatus }[];
  status: TicketStatus;
}

const TICKETS: SampleTicket[] = [
  {
    inst: 'CVU',
    by: 'admin@cvu.example.edu.pk',
    subject: 'Applicants cannot open the bank challan PDF on iPhone',
    category: 'TECHNICAL',
    priority: 'URGENT',
    hoursAgo: 1,
    status: 'OPEN',
    thread: [
      {
        side: 'INSTITUTION',
        afterHours: 0,
        body: 'Several applicants report that the challan PDF opens as a blank page in Safari on iPhone. Android and laptops work. The fee deadline is in three days.',
      },
    ],
  },
  {
    inst: 'CVU',
    by: 'admin@cvu.example.edu.pk',
    subject: 'Add a second bank account for the evening shift fee',
    category: 'BILLING',
    priority: 'NORMAL',
    hoursAgo: 52,
    status: 'WAITING_ON_INSTITUTION',
    thread: [
      {
        side: 'INSTITUTION',
        afterHours: 0,
        body: 'Our evening programs collect fees in a separate account at Meezan Bank. Can the challan show a different account per shift?',
      },
      {
        side: 'PLATFORM',
        afterHours: 5,
        status: 'WAITING_ON_INSTITUTION',
        body: 'One account per institution is supported today. Please send the account title and IBAN of the evening account and confirm which programs use it, and we will check the options for your plan.',
      },
    ],
  },
  {
    inst: 'RIT',
    by: 'admin@rit.example.edu.pk',
    subject: 'Merit list 2 shows a candidate twice',
    category: 'DATA_CORRECTION',
    priority: 'HIGH',
    hoursAgo: 30,
    status: 'RESOLVED',
    thread: [
      {
        side: 'INSTITUTION',
        afterHours: 0,
        body: 'In the draft of merit list 2 the same applicant appears under BSCS morning and BSSE morning. Is this expected?',
      },
      {
        side: 'PLATFORM',
        afterHours: 3,
        status: 'IN_PROGRESS',
        body: 'Thank you. We are checking the list with the preference order of that application.',
      },
      {
        side: 'PLATFORM',
        afterHours: 6,
        status: 'RESOLVED',
        body: 'The applicant is selected for the first preference only; the second row is the waiting list position, which is shown so that the applicant can be moved up if the first offer is declined. No change is needed.',
      },
    ],
  },
  {
    inst: 'RIT',
    by: 'admin@rit.example.edu.pk',
    subject: 'Invite e-mail not received by the new finance officer',
    category: 'ACCOUNT_ACCESS',
    priority: 'NORMAL',
    hoursAgo: 120,
    status: 'CLOSED',
    thread: [
      {
        side: 'INSTITUTION',
        afterHours: 0,
        body: 'We invited our new finance officer two days ago but the invitation e-mail did not arrive.',
      },
      {
        side: 'PLATFORM',
        afterHours: 4,
        status: 'RESOLVED',
        body: 'The e-mail was rejected by your mail server as spam. We resent it and asked your IT team to allow mail from ADMITRA.',
      },
      { side: 'INSTITUTION', afterHours: 20, status: 'CLOSED', body: 'Received now, thank you.' },
    ],
  },
  {
    inst: 'MCU',
    by: 'admin@mcu.example.edu.pk',
    subject: 'Export the merit list with father names for the notice board',
    category: 'FEATURE_REQUEST',
    priority: 'LOW',
    hoursAgo: 80,
    status: 'IN_PROGRESS',
    thread: [
      {
        side: 'INSTITUTION',
        afterHours: 0,
        body: 'Our notice board format needs the father name next to each candidate. Can the merit list export include it?',
      },
      {
        side: 'PLATFORM',
        afterHours: 30,
        status: 'IN_PROGRESS',
        body: 'Public lists never show CNICs and shorten names by design. The internal CSV export of a merit list already includes full names; we are reviewing whether father names can be added to it.',
      },
    ],
  },
  {
    inst: 'NSC',
    by: 'admin@nsc.example.edu.pk',
    subject: 'Change of the institution contact person',
    category: 'OTHER',
    priority: 'NORMAL',
    hoursAgo: 40,
    status: 'OPEN',
    thread: [
      {
        side: 'INSTITUTION',
        afterHours: 0,
        body: 'Our registrar has changed. Please update the contact person to Mr. Kamran Shah (registrar@nsc.example.edu.pk).',
      },
    ],
  },
];

async function seedTickets(superAdmin: { _id: Types.ObjectId; fullName: string }) {
  const now = realNow().getTime();
  let n = 0;
  for (const t of TICKETS) {
    const inst = await InstitutionModel.findOne({ shortName: t.inst }).lean();
    const user = await UserModel.findOne({ email: t.by }).lean();
    if (!inst || !user) continue;
    const opened = new Date(now - t.hoursAgo * HOUR);
    const at = (h: number) => new Date(opened.getTime() + h * HOUR);
    const firstPlatform = t.thread.find((m) => m.side === 'PLATFORM');
    const last = t.thread.at(-1)!;
    const year = opened.getFullYear();
    const ticket = await SupportTicketModel.create({
      ticketNumber: `TKT-${year}-${pad(await nextSeq(`ticket:${year}`), 5)}`,
      institutionId: inst._id,
      openedBy: user._id,
      openedByName: user.fullName,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      responseDueAt: new Date(opened.getTime() + RESPONSE_TARGET_HOURS[t.priority] * HOUR),
      firstResponseAt: firstPlatform ? at(firstPlatform.afterHours) : null,
      assignedTo: firstPlatform ? superAdmin._id : null,
      assignedToName: firstPlatform ? superAdmin.fullName : '',
      messages: t.thread.map((m) => ({
        authorId: m.side === 'PLATFORM' ? superAdmin._id : user._id,
        authorName: m.side === 'PLATFORM' ? superAdmin.fullName : user.fullName,
        side: m.side,
        body: m.body,
        statusChange: m.status ?? null,
        createdAt: at(m.afterHours),
      })),
      lastActivityAt: at(last.afterHours),
      resolvedAt: ['RESOLVED', 'CLOSED'].includes(t.status)
        ? at(t.thread.find((m) => m.status === 'RESOLVED')?.afterHours ?? last.afterHours)
        : null,
      closedAt: t.status === 'CLOSED' ? at(last.afterHours) : null,
      createdAt: opened,
    });
    await AuditLogModel.create({
      actorId: user._id,
      actorName: user.fullName,
      institutionId: inst._id,
      action: 'SUPPORT_TICKET_OPENED',
      entity: 'SupportTicket',
      entityId: String(ticket._id),
      changes: { ticketNumber: ticket.ticketNumber, priority: t.priority, category: t.category },
      ip: IP,
      createdAt: opened,
    });
    for (const m of t.thread.slice(1))
      await AuditLogModel.create({
        actorId: m.side === 'PLATFORM' ? superAdmin._id : user._id,
        actorName: m.side === 'PLATFORM' ? superAdmin.fullName : user.fullName,
        institutionId: inst._id,
        action: 'SUPPORT_TICKET_REPLIED',
        entity: 'SupportTicket',
        entityId: String(ticket._id),
        changes: { side: m.side, status: m.status ?? t.status },
        ip: IP,
        createdAt: at(m.afterHours),
      });
    const toPlatform = last.side === 'INSTITUTION';
    await NotificationModel.create({
      userId: toPlatform ? superAdmin._id : user._id,
      type: 'SUPPORT',
      title: toPlatform
        ? `${t.thread.length === 1 ? `New ${t.priority.toLowerCase()} ticket` : `${user.fullName} replied to`} ${ticket.ticketNumber}`
        : `ADMITRA support replied to ${ticket.ticketNumber}`,
      body: t.thread.length === 1 ? t.subject : last.body.slice(0, 160),
      link: toPlatform ? `/platform/support/${ticket._id}` : `/institution/support/${ticket._id}`,
      createdAt: at(last.afterHours),
    });
    n++;
  }
  log(`Support tickets: ${n} across CVU, RIT, MCU and NSC (open, waiting, in progress, resolved and closed)`);
}

export async function seedPhase4() {
  const superAdmin = (await UserModel.findOne({ platformRole: 'SUPER_ADMIN' }).select('fullName').lean())!;
  const sa = { _id: superAdmin._id as Types.ObjectId, fullName: superAdmin.fullName };
  await seedSetupAudit(sa);
  await seedTickets(sa);
}
