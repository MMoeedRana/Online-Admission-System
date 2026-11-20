import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../../config/env';
import { PERMISSIONS } from '../../../constants/permissions';
import { audit } from '../../../lib/audit';
import { brand } from '../../../lib/brand';
import { sendMail } from '../../../lib/mailer';
import { ApplicationModel } from '../../applications/application.model';
import { CampaignModel } from '../../campaigns/campaign.model';
import { VoucherModel } from '../../fees/fee.models';
import { OfferModel } from '../../merit/merit.models';
import { notify } from '../../notifications/notify';
import {
  SupportTicketModel,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../../support/support.model';
import { openTicket, reply } from '../../support/support.service';
import { UserModel } from '../../users/user.model';
import { IntegrityAlertModel } from '../agent.models';
import { adminUserIds } from '../integrity.rules';
import {
  defineTool,
  pktDay,
  resolveCampaign,
  resolveInstitution,
  ToolError,
  type AgentContext,
} from './common';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function remind(userIds: unknown[], n: { title: string; body: string; link: string }) {
  const users = await UserModel.find({ _id: { $in: [...new Set(userIds.map(String))] }, status: 'ACTIVE' })
    .select('email fullName')
    .lean();
  for (const u of users) {
    await notify(u._id, { type: 'REMINDER', ...n });
    await sendMail({
      to: u.email,
      subject: n.title,
      heading: esc(n.title),
      paragraphs: [`Dear ${esc(u.fullName)},`, esc(n.body)],
      action: { label: `Open ${brand().platformName}`, url: `${env.WEB_URL}${n.link}` },
    });
  }
  return users.length;
}

async function unpaidChallans(ctx: AgentContext, campaign?: string) {
  const c = campaign ? await resolveCampaign({ institutionId: ctx.institutionId }, campaign) : null;
  const apps = c ? await ApplicationModel.find({ campaignId: c._id }).distinct('_id') : null;
  return VoucherModel.find({
    institutionId: ctx.institutionId,
    status: 'ISSUED',
    ...(apps ? { applicationId: { $in: apps } } : {}),
  })
    .select('applicantId type amount dueDate voucherNumber')
    .lean();
}

async function expiringOffers(ctx: AgentContext, withinDays: number) {
  return OfferModel.find({
    institutionId: ctx.institutionId,
    status: 'OFFERED',
    deadline: { $gte: new Date(), $lte: new Date(Date.now() + withinDays * 864e5) },
  })
    .select('applicantId deadline')
    .lean();
}

async function openDrafts(ctx: AgentContext) {
  const open = await CampaignModel.find({ institutionId: ctx.institutionId, status: 'OPEN' })
    .select('_id title closesAt')
    .lean();
  const drafts = await ApplicationModel.find({ campaignId: { $in: open.map((c) => c._id) }, status: 'DRAFT' })
    .select('applicantId campaignId')
    .lean();
  return { open, drafts };
}

export const actionTools = [
  defineTool({
    name: 'send_renewal_reminder',
    label: 'Preparing a renewal reminder',
    description:
      'Reminds the admins of an institution (notification and e-mail) that its subscription ends soon or has ended. Runs only after the Super Admin confirms.',
    scope: 'platform',
    kind: 'action',
    input: z.object({ institution: z.string().min(2).max(120) }),
    describe: async (ctx, i: { institution: string }) => {
      const inst = await resolveInstitution(ctx, i.institution);
      if (!inst) throw new ToolError('Institution not found.');
      const n = (await adminUserIds(inst._id)).length;
      return `Send a subscription renewal reminder to ${n} admin(s) of ${inst.name} (subscription ends ${inst.subscription?.endsAt ? pktDay(inst.subscription.endsAt) : 'not set'}).`;
    },
    run: async (ctx, i: { institution: string }) => {
      const inst = await resolveInstitution(ctx, i.institution);
      if (!inst) throw new ToolError('Institution not found.');
      const ends = inst.subscription?.endsAt ? pktDay(inst.subscription.endsAt) : 'soon';
      const sent = await remind(await adminUserIds(inst._id), {
        title: `Your ${brand().platformName} subscription needs renewal`,
        body: `The subscription of ${inst.name} ends on ${ends}. Please contact ${brand().platformName} support to renew it so that your workspace stays fully usable.`,
        link: '/institution/settings',
      });
      await audit(
        ctx.req,
        'AGENT_RENEWAL_REMINDER_SENT',
        'Institution',
        inst._id,
        { recipients: sent },
        { institutionId: inst._id },
      );
      return { sent, institution: inst.name };
    },
  }),

  defineTool({
    name: 'reply_to_ticket',
    label: 'Preparing a ticket reply',
    description:
      'Posts a reply from the platform team to a support ticket (by ticket number) and optionally sets its status. The institution is notified. Runs only after confirmation.',
    scope: 'platform',
    kind: 'action',
    input: z.object({
      ticketNumber: z.string().min(5).max(30),
      message: z.string().min(5).max(3000),
      status: z.enum(['IN_PROGRESS', 'WAITING_ON_INSTITUTION', 'RESOLVED', 'CLOSED']).optional(),
    }),
    describe: async (_ctx, i: { ticketNumber: string; message: string; status?: string }) => {
      const t = await SupportTicketModel.findOne({ ticketNumber: i.ticketNumber.toUpperCase() }).lean();
      if (!t) throw new ToolError(`Ticket ${i.ticketNumber} not found.`);
      return `Reply to ${t.ticketNumber} (“${t.subject}”)${i.status ? ` and set it to ${i.status.replace(/_/g, ' ').toLowerCase()}` : ''}: “${i.message.slice(0, 160)}${i.message.length > 160 ? '…' : ''}”`;
    },
    run: async (
      ctx,
      i: { ticketNumber: string; message: string; status?: (typeof TICKET_STATUSES)[number] },
    ) => {
      const t = await SupportTicketModel.findOne({ ticketNumber: i.ticketNumber.toUpperCase() }).lean();
      if (!t) throw new ToolError(`Ticket ${i.ticketNumber} not found.`);
      const r = await reply(ctx.req, t._id, 'PLATFORM', { message: i.message, status: i.status });
      return { ticket: r.ticketNumber, status: r.status };
    },
  }),

  defineTool({
    name: 'remind_unpaid_fees',
    label: 'Preparing fee reminders',
    description:
      'Reminds applicants whose challan (application or admission fee) is still unpaid. Optional campaign. Runs only after confirmation.',
    scope: 'institution',
    kind: 'action',
    permission: PERMISSIONS.PAYMENTS_VERIFY,
    input: z.object({ campaign: z.string().max(80).optional() }),
    describe: async (ctx, i: { campaign?: string }) => {
      const v = await unpaidChallans(ctx, i.campaign);
      return `Send a fee reminder to ${new Set(v.map((x) => String(x.applicantId))).size} applicant(s) with ${v.length} unpaid challan(s).`;
    },
    run: async (ctx, i: { campaign?: string }) => {
      const v = await unpaidChallans(ctx, i.campaign);
      const sent = await remind(
        v.map((x) => x.applicantId),
        {
          title: `Fee reminder from ${ctx.institutionName}`,
          body: `Your fee challan at ${ctx.institutionName} is still unpaid. Please pay it before the due date and upload the proof of payment.`,
          link: '/applicant/applications',
        },
      );
      await audit(ctx.req, 'AGENT_FEE_REMINDERS_SENT', 'FeeVoucher', '', {
        recipients: sent,
        challans: v.length,
      });
      return { sent, challans: v.length };
    },
  }),

  defineTool({
    name: 'remind_offer_deadline',
    label: 'Preparing offer deadline reminders',
    description:
      'Reminds applicants with an open admission offer whose deadline is within the next N days (default 2). Runs only after confirmation.',
    scope: 'institution',
    kind: 'action',
    permission: PERMISSIONS.MERIT_PUBLISH,
    input: z.object({ withinDays: z.coerce.number().int().min(1).max(14).optional() }),
    describe: async (ctx, i: { withinDays?: number }) => {
      const o = await expiringOffers(ctx, i.withinDays ?? 2);
      return `Remind ${o.length} applicant(s) whose offer expires within ${i.withinDays ?? 2} day(s) to accept or decline it.`;
    },
    run: async (ctx, i: { withinDays?: number }) => {
      const o = await expiringOffers(ctx, i.withinDays ?? 2);
      const sent = await remind(
        o.map((x) => x.applicantId),
        {
          title: `Your admission offer from ${ctx.institutionName} expires soon`,
          body: `Please accept or decline your admission offer before the deadline; after it the seat goes to the next applicant on the waiting list.`,
          link: '/applicant/results',
        },
      );
      await audit(ctx.req, 'AGENT_OFFER_REMINDERS_SENT', 'AdmissionOffer', '', { recipients: sent });
      return { sent };
    },
  }),

  defineTool({
    name: 'remind_incomplete_applications',
    label: 'Preparing reminders for unfinished applications',
    description:
      'Reminds applicants who started an application in an open campaign but have not submitted it. Runs only after confirmation.',
    scope: 'institution',
    kind: 'action',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    input: z.object({}),
    describe: async (ctx) => {
      const { drafts, open } = await openDrafts(ctx);
      return `Remind ${drafts.length} applicant(s) with an unsubmitted application in ${open.map((c) => c.title).join(', ') || 'no open campaign'}.`;
    },
    run: async (ctx) => {
      const { drafts, open } = await openDrafts(ctx);
      const closes = open.map((c) => `${c.title} closes on ${pktDay(c.closesAt)}`).join('; ');
      const sent = await remind(
        drafts.map((d) => d.applicantId),
        {
          title: `Complete your application to ${ctx.institutionName}`,
          body: `You started an application but have not submitted it yet. ${closes}.`,
          link: '/applicant/applications',
        },
      );
      await audit(ctx.req, 'AGENT_DRAFT_REMINDERS_SENT', 'Application', '', { recipients: sent });
      return { sent };
    },
  }),

  defineTool({
    name: 'mark_alert_reviewed',
    label: 'Preparing to close an alert',
    description:
      'Marks an integrity alert as reviewed (or dismissed) with a note, after a person has checked it. Runs only after confirmation.',
    scope: 'both',
    kind: 'action',
    permission: PERMISSIONS.AUDIT_VIEW,
    input: z.object({
      alertId: z.string().min(12).max(40),
      outcome: z.enum(['REVIEWED', 'DISMISSED']).optional(),
      note: z.string().min(3).max(500),
    }),
    describe: async (ctx, i: { alertId: string; outcome?: string; note: string }) => {
      if (!Types.ObjectId.isValid(i.alertId)) throw new ToolError('Unknown alert.');
      const a = await IntegrityAlertModel.findOne({
        _id: i.alertId,
        ...(ctx.scope === 'INSTITUTION' ? { institutionId: ctx.institutionId } : {}),
      }).lean();
      if (!a) throw new ToolError('Alert not found.');
      return `Mark the alert “${a.title}” as ${(i.outcome ?? 'REVIEWED').toLowerCase()} with the note “${i.note}”.`;
    },
    run: async (ctx, i: { alertId: string; outcome?: 'REVIEWED' | 'DISMISSED'; note: string }) => {
      const a = await IntegrityAlertModel.findOneAndUpdate(
        { _id: i.alertId, ...(ctx.scope === 'INSTITUTION' ? { institutionId: ctx.institutionId } : {}) },
        {
          $set: {
            status: i.outcome ?? 'REVIEWED',
            note: i.note,
            reviewedBy: ctx.userId,
            reviewedByName: ctx.userName,
          },
        },
        { returnDocument: 'after' },
      );
      if (!a) throw new ToolError('Alert not found.');
      await audit(
        ctx.req,
        'INTEGRITY_ALERT_REVIEWED',
        'IntegrityAlert',
        a._id,
        { outcome: a.status, note: i.note },
        { institutionId: a.institutionId as Types.ObjectId | null },
      );
      return { alert: a.title, status: a.status };
    },
  }),

  defineTool({
    name: 'open_support_ticket',
    label: 'Preparing a support ticket',
    description:
      'Opens a support ticket to the platform team on behalf of the institution admin. Runs only after confirmation.',
    scope: 'institution',
    kind: 'action',
    permission: PERMISSIONS.SUPPORT_TICKETS,
    input: z.object({
      subject: z.string().min(5).max(150),
      category: z.enum(TICKET_CATEGORIES),
      priority: z.enum(TICKET_PRIORITIES).optional(),
      message: z.string().min(5).max(3000),
    }),
    describe: async (_ctx, i: { subject: string; priority?: string }) =>
      `Open a ${(i.priority ?? 'NORMAL').toLowerCase()} priority support ticket: “${i.subject}”.`,
    run: async (
      ctx,
      i: {
        subject: string;
        category: (typeof TICKET_CATEGORIES)[number];
        priority?: (typeof TICKET_PRIORITIES)[number];
        message: string;
      },
    ) => {
      const t = await openTicket(ctx.req, { ...i, priority: i.priority ?? 'NORMAL' });
      return { ticket: t.ticketNumber };
    },
  }),
];
