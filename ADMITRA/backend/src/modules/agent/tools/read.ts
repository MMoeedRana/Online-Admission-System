import { Types } from 'mongoose';
import { z } from 'zod';
import { PERMISSIONS } from '../../../constants/permissions';
import { escapeRegex } from '../../../lib/pagination';
import { platformAnalytics } from '../../analytics/platform-analytics';
import { institutionAnalytics } from '../../analytics/analytics.service';
import { ApplicationModel } from '../../applications/application.model';
import { AuditLogModel } from '../../audit/audit.model';
import { CampaignModel } from '../../campaigns/campaign.model';
import { PaymentModel, VoucherModel } from '../../fees/fee.models';
import { InstitutionModel, subscriptionState } from '../../institutions/institution.model';
import { EnrollmentModel, MeritListModel, OfferModel } from '../../merit/merit.models';
import { PlanModel } from '../../plans/plan.model';
import { SubscriptionPaymentModel } from '../../platform/billing.model';
import { ProfileModel } from '../../profile/profile.model';
import { ProgramModel, totalSeats } from '../../programs/program.model';
import { RecordModel } from '../../records/record.models';
import { MemberModel } from '../../staff/member.model';
import { SupportTicketModel } from '../../support/support.model';
import { responseState } from '../../support/support.model';
import { UserModel } from '../../users/user.model';
import { IntegrityAlertModel } from '../agent.models';
import { institutionNames, refreshAlerts } from '../integrity.rules';
import {
  defineTool,
  institutionArg,
  maskCnic,
  pktDay,
  resolveCampaign,
  resolveInstitution,
  since,
  startOfPktDay,
  tenantFilter,
  ToolError,
} from './common';

const days = z.coerce
  .number()
  .int()
  .min(1)
  .max(365)
  .optional()
  .describe('Number of days to look back (default depends on the tool)');
const money = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const readTools = [
  defineTool({
    name: 'get_overview',
    label: 'Reading today’s figures',
    description:
      'Key figures for today (or the last N days): applicants, applications, payments, enrollments, pending work, tickets, alerts and (platform) subscriptions. Start here for "what happened today" questions.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.DASHBOARD_VIEW,
    input: z.object({ days, institution: institutionArg }),
    run: async (ctx, i: { days?: number; institution?: string }) => {
      const from = i.days ? since(i.days) : startOfPktDay();
      const t = await tenantFilter(ctx, i.institution);
      const submittedApps = await ApplicationModel.find({ ...t, status: { $ne: 'DRAFT' } })
        .select('applicantId')
        .lean();
      const [
        submitted,
        drafts,
        verifiedPayments,
        pendingProofs,
        enrollments,
        openOffers,
        openTickets,
        openAlerts,
      ] = await Promise.all([
        ApplicationModel.countDocuments({ ...t, submittedAt: { $gte: from } }),
        ApplicationModel.countDocuments({ ...t, status: 'DRAFT' }),
        PaymentModel.aggregate<{ n: number; amount: number }>([
          { $match: { ...t, status: 'VERIFIED', decidedAt: { $gte: from } } },
          { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
        PaymentModel.countDocuments({ ...t, status: 'PENDING' }),
        EnrollmentModel.countDocuments({ ...t, status: 'ENROLLED', enrolledAt: { $gte: from } }),
        OfferModel.countDocuments({ ...t, status: 'OFFERED' }),
        SupportTicketModel.countDocuments({
          ...t,
          status: { $in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_INSTITUTION'] },
        }),
        IntegrityAlertModel.countDocuments({ ...t, status: 'OPEN' }),
      ]);
      const marksWaiting = await RecordModel.countDocuments({
        userId: { $in: submittedApps.map((a) => a.applicantId) },
        current: true,
        verificationStatus: { $in: ['UNDER_VERIFICATION', 'MISMATCH'] },
      });
      const base = {
        period: i.days ? `last ${i.days} days` : `today (${pktDay()}, Pakistan time)`,
        applicationsSubmitted: submitted,
        draftsNotSubmitted: drafts,
        paymentsVerified: verifiedPayments[0]?.n ?? 0,
        amountVerified: money(verifiedPayments[0]?.amount ?? 0),
        paymentProofsWaiting: pendingProofs,
        marksRecordsWaitingForOfficer: marksWaiting,
        enrollments,
        offersWaitingForAnswer: openOffers,
        openSupportTickets: openTickets,
        openIntegrityAlerts: openAlerts,
      };
      if (ctx.scope === 'INSTITUTION' || i.institution) return base;
      const [newApplicants, institutions, fees, soon] = await Promise.all([
        UserModel.countDocuments({ accountType: 'APPLICANT', createdAt: { $gte: from } }),
        InstitutionModel.aggregate<{ _id: string; n: number }>([
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        SubscriptionPaymentModel.aggregate<{ n: number; amount: number }>([
          { $match: { createdAt: { $gte: from } } },
          { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
        InstitutionModel.countDocuments({
          status: 'ACTIVE',
          'subscription.endsAt': { $lte: new Date(Date.now() + 14 * 864e5) },
        }),
      ]);
      return {
        ...base,
        newApplicantAccounts: newApplicants,
        institutionsByStatus: Object.fromEntries(institutions.map((x) => [x._id, x.n])),
        platformFeesReceived: { payments: fees[0]?.n ?? 0, amount: money(fees[0]?.amount ?? 0) },
        subscriptionsEndingIn14Days: soon,
      };
    },
  }),

  defineTool({
    name: 'list_institutions',
    label: 'Looking at institutions',
    description:
      'Institutions on the platform with status, plan, subscription state and end date, and number of submitted applications.',
    scope: 'platform',
    kind: 'read',
    input: z.object({
      status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
      search: z.string().max(80).optional(),
    }),
    run: async (_ctx, i: { status?: string; search?: string }) => {
      const f: Record<string, unknown> = {};
      if (i.status) f.status = i.status;
      if (i.search) f.name = new RegExp(escapeRegex(i.search), 'i');
      const list = await InstitutionModel.find(f).sort({ name: 1 }).limit(50).lean();
      const [plans, apps] = await Promise.all([
        PlanModel.find({ _id: { $in: list.map((x) => x.planId).filter(Boolean) } }).lean(),
        ApplicationModel.aggregate<{ _id: Types.ObjectId; n: number }>([
          { $match: { institutionId: { $in: list.map((x) => x._id) }, status: { $ne: 'DRAFT' } } },
          { $group: { _id: '$institutionId', n: { $sum: 1 } } },
        ]),
      ]);
      return list.map((x) => ({
        name: x.name,
        shortName: x.shortName,
        city: x.city,
        status: x.status,
        plan: plans.find((p) => String(p._id) === String(x.planId))?.name ?? 'No plan',
        subscription: subscriptionState(x),
        subscriptionEnds: x.subscription?.endsAt ? pktDay(x.subscription.endsAt) : null,
        applications: apps.find((a) => String(a._id) === String(x._id))?.n ?? 0,
      }));
    },
  }),

  defineTool({
    name: 'institution_report',
    label: 'Preparing the institution report',
    description:
      'Full report of one institution: plan and subscription, staff, programs and seats, campaigns, applications by status, payments, merit lists, offers, enrollments, tickets and open alerts.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.DASHBOARD_VIEW,
    input: z.object({ institution: institutionArg }),
    run: async (ctx, i: { institution?: string }) => {
      const inst = await resolveInstitution(ctx, i.institution);
      if (!inst) throw new ToolError('Say which institution (name or short name).');
      const t = { institutionId: inst._id };
      const [
        plan,
        staff,
        programs,
        campaigns,
        byStatus,
        payments,
        lists,
        offers,
        enrolled,
        tickets,
        alerts,
        fees,
      ] = await Promise.all([
        PlanModel.findById(inst.planId).lean(),
        MemberModel.countDocuments({ ...t, status: 'ACTIVE' }),
        ProgramModel.find({ ...t, status: 'ACTIVE' })
          .select('title code shifts')
          .lean(),
        CampaignModel.find(t).select('title code status opensAt closesAt').sort({ opensAt: -1 }).lean(),
        ApplicationModel.aggregate<{ _id: string; n: number }>([
          { $match: { ...t, status: { $ne: 'DRAFT' } } },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        PaymentModel.aggregate<{ _id: string; n: number; amount: number }>([
          { $match: t },
          { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
        MeritListModel.find(t)
          .select('listNumber status revision publishedAt')
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
        OfferModel.aggregate<{ _id: string; n: number }>([
          { $match: t },
          { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        EnrollmentModel.countDocuments({ ...t, status: 'ENROLLED' }),
        SupportTicketModel.countDocuments({ ...t, status: { $nin: ['RESOLVED', 'CLOSED'] } }),
        IntegrityAlertModel.find({ ...t, status: 'OPEN' })
          .select('title severity detail')
          .lean(),
        ctx.scope === 'PLATFORM'
          ? SubscriptionPaymentModel.find(t).sort({ createdAt: -1 }).limit(5).lean()
          : Promise.resolve([]),
      ]);
      return {
        name: inst.name,
        city: inst.city,
        status: inst.status,
        plan: plan
          ? {
              name: plan.name,
              pricePerMonth: money(plan.priceMonthly),
              applicationLimit: plan.limits?.applicationsPerCycle,
            }
          : null,
        subscription: {
          state: subscriptionState(inst),
          ends: inst.subscription?.endsAt ? pktDay(inst.subscription.endsAt) : null,
        },
        activeStaff: staff,
        programs: programs.map((p) => ({ title: p.title, code: p.code, seats: totalSeats(p) })),
        campaigns: campaigns.map((c) => ({
          title: c.title,
          code: c.code,
          status: c.status,
          closes: pktDay(c.closesAt),
        })),
        applicationsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
        paymentsByStatus: Object.fromEntries(
          payments.map((p) => [p._id, { count: p.n, amount: money(p.amount) }]),
        ),
        meritLists: lists.map((l) => ({ list: l.listNumber, status: l.status, revision: l.revision })),
        offersByStatus: Object.fromEntries(offers.map((o) => [o._id, o.n])),
        enrolled,
        openTickets: tickets,
        openAlerts: alerts.map((a) => ({ severity: a.severity, title: a.title, detail: a.detail })),
        ...(ctx.scope === 'PLATFORM'
          ? {
              recentPlatformFeePayments: fees.map((f) => ({
                date: pktDay(f.createdAt),
                amount: money(f.amount),
                months: f.months,
                plan: f.planName,
                reference: f.reference,
              })),
            }
          : {}),
      };
    },
  }),

  defineTool({
    name: 'subscriptions_and_fees',
    label: 'Checking subscriptions and platform fees',
    description:
      'Platform fees paid by institutions (renewals) in the period, totals, subscriptions that end soon, in the grace period or read-only. Inside an institution: its own plan and fee history.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.INSTITUTION_SETTINGS,
    input: z.object({ days }),
    run: async (ctx, i: { days?: number }) => {
      const d = i.days ?? 30;
      const t = ctx.scope === 'INSTITUTION' ? { institutionId: ctx.institutionId } : {};
      const payments = await SubscriptionPaymentModel.find({ ...t, createdAt: { $gte: since(d) } })
        .sort({ createdAt: -1 })
        .lean();
      const names = await institutionNames(payments.map((p) => p.institutionId));
      const insts = await InstitutionModel.find({
        ...(ctx.scope === 'INSTITUTION' ? { _id: ctx.institutionId } : {}),
        status: { $in: ['ACTIVE', 'SUSPENDED'] },
      })
        .select('name shortName subscription planId')
        .lean();
      const soon = Date.now() + 30 * 864e5;
      return {
        period: `last ${d} days`,
        feesReceived: money(payments.reduce((s, p) => s + p.amount, 0)),
        payments: payments.map((p) => ({
          institution: names.get(String(p.institutionId)),
          date: pktDay(p.createdAt),
          amount: money(p.amount),
          months: p.months,
          plan: p.planName,
          method: p.method,
          reference: p.reference || '-',
        })),
        endingWithin30Days: insts
          .filter(
            (x) =>
              x.subscription?.endsAt &&
              x.subscription.endsAt.getTime() < soon &&
              subscriptionState(x) === 'ACTIVE',
          )
          .map((x) => ({ institution: x.shortName || x.name, ends: pktDay(x.subscription!.endsAt!) })),
        inGracePeriod: insts
          .filter((x) => subscriptionState(x) === 'GRACE')
          .map((x) => x.shortName || x.name),
        readOnly: insts.filter((x) => subscriptionState(x) === 'READ_ONLY').map((x) => x.shortName || x.name),
      };
    },
  }),

  defineTool({
    name: 'application_stats',
    label: 'Counting applications',
    description: 'Applications of a campaign (or all) grouped by status, by program (with seats) or by day.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.DASHBOARD_VIEW,
    input: z.object({
      institution: institutionArg,
      campaign: z.string().max(80).optional().describe('Campaign title or code; default all campaigns'),
      groupBy: z.enum(['status', 'program', 'day']).optional(),
      days,
    }),
    run: async (ctx, i: { institution?: string; campaign?: string; groupBy?: string; days?: number }) => {
      const t = await tenantFilter(ctx, i.institution);
      const f: Record<string, unknown> = { ...t, status: { $ne: 'DRAFT' } };
      if (i.campaign) {
        const c = await resolveCampaign(t, i.campaign);
        if (c) f.campaignId = c._id;
      }
      if (i.days) f.submittedAt = { $gte: since(i.days) };
      if (i.groupBy === 'day') {
        const rows = await ApplicationModel.aggregate<{ _id: string; n: number }>([
          { $match: f },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt', timezone: 'Asia/Karachi' } },
              n: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 31 },
        ]);
        return rows.map((r) => ({ day: r._id, applications: r.n }));
      }
      if (i.groupBy === 'program') {
        const rows = await ApplicationModel.aggregate<{ _id: Types.ObjectId; n: number; first: number }>([
          { $match: f },
          { $unwind: '$preferences' },
          {
            $group: {
              _id: '$preferences.programId',
              n: { $sum: 1 },
              first: { $sum: { $cond: [{ $eq: ['$preferences.order', 1] }, 1, 0] } },
            },
          },
        ]);
        const progs = await ProgramModel.find({ _id: { $in: rows.map((r) => r._id) } })
          .select('title shifts institutionId')
          .lean();
        return rows.map((r) => {
          const p = progs.find((x) => String(x._id) === String(r._id));
          return {
            program: p?.title,
            seats: p ? totalSeats(p) : null,
            applications: r.n,
            firstChoice: r.first,
            perSeat: p ? Math.round((r.n / Math.max(1, totalSeats(p))) * 100) / 100 : null,
          };
        });
      }
      const rows = await ApplicationModel.aggregate<{ _id: string; n: number }>([
        { $match: f },
        { $group: { _id: '$status', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]);
      return {
        total: rows.reduce((s, r) => s + r.n, 0),
        byStatus: Object.fromEntries(rows.map((r) => [r._id, r.n])),
      };
    },
  }),

  defineTool({
    name: 'payment_review',
    label: 'Reviewing payments',
    description:
      'Proofs of payment waiting for the finance office (oldest first), verified payments whose amount differs from the challan, recent rejections, and unpaid challans.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.PAYMENTS_VERIFY,
    input: z.object({ institution: institutionArg, days }),
    run: async (ctx, i: { institution?: string; days?: number }) => {
      const t = await tenantFilter(ctx, i.institution);
      const d = i.days ?? 30;
      const [pending, verified, rejected, unpaid] = await Promise.all([
        PaymentModel.find({ ...t, status: 'PENDING' })
          .sort({ createdAt: 1 })
          .limit(20)
          .lean(),
        PaymentModel.find({ ...t, status: 'VERIFIED', decidedAt: { $gte: since(d) } })
          .select('voucherId amount reference decidedByName')
          .lean(),
        PaymentModel.find({ ...t, status: 'REJECTED', decidedAt: { $gte: since(d) } })
          .select('reference reason decidedByName')
          .limit(10)
          .lean(),
        VoucherModel.aggregate<{ _id: string; n: number; amount: number }>([
          { $match: { ...t, status: { $in: ['ISSUED', 'AWAITING_VERIFICATION'] } } },
          { $group: { _id: '$type', n: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
      ]);
      const vouchers = await VoucherModel.find({
        _id: { $in: [...pending, ...verified].map((p) => p.voucherId) },
      })
        .select('amount voucherNumber')
        .lean();
      const v = (id: unknown) => vouchers.find((x) => String(x._id) === String(id));
      const names = await institutionNames(pending.map((p) => p.institutionId));
      return {
        waitingForVerification: pending.map((p) => ({
          institution: names.get(String(p.institutionId)),
          reference: p.reference,
          amount: money(p.amount),
          challanAmount: v(p.voucherId) ? money(v(p.voucherId)!.amount) : null,
          amountMatches: v(p.voucherId)?.amount === p.amount,
          waitingSince: pktDay(p.createdAt),
        })),
        verifiedWithDifferentAmount: verified
          .filter((p) => v(p.voucherId) && v(p.voucherId)!.amount !== p.amount)
          .map((p) => ({
            reference: p.reference,
            paid: money(p.amount),
            challan: money(v(p.voucherId)!.amount),
            verifiedBy: p.decidedByName,
          })),
        recentRejections: rejected.map((p) => ({
          reference: p.reference,
          reason: p.reason,
          by: p.decidedByName,
        })),
        unpaidChallans: Object.fromEntries(
          unpaid.map((u) => [u._id, { count: u.n, amount: money(u.amount) }]),
        ),
      };
    },
  }),

  defineTool({
    name: 'integrity_alerts',
    label: 'Running integrity checks',
    description:
      'Runs the integrity rules (bulk or overridden marks verifications, payments below the challan, stale payment proofs and fraud flags, repeated list revisions, revocation spikes, night-time sensitive actions, offers over capacity, late applications) and lists open alerts with evidence. Use for questions about illegal, suspicious or irregular activity.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.AUDIT_VIEW,
    input: z.object({ institution: institutionArg, days, includeReviewed: z.boolean().optional() }),
    run: async (ctx, i: { institution?: string; days?: number; includeReviewed?: boolean }) => {
      const t = await tenantFilter(ctx, i.institution);
      await refreshAlerts({ institutionId: (t.institutionId as Types.ObjectId) ?? null, days: i.days ?? 30 });
      const alerts = await IntegrityAlertModel.find({
        ...t,
        ...(i.includeReviewed ? {} : { status: 'OPEN' }),
      })
        .sort({ severity: 1, lastSeenAt: -1 })
        .limit(30)
        .lean();
      const names = await institutionNames(alerts.map((a) => a.institutionId));
      return {
        note: 'Findings are patterns that need a human review, not proof of wrongdoing.',
        alerts: alerts.map((a) => ({
          id: String(a._id),
          severity: a.severity,
          institution: a.institutionId ? names.get(String(a.institutionId)) : 'Platform',
          title: a.title,
          detail: a.detail,
          evidence: a.evidence,
          status: a.status,
          since: pktDay(a.firstSeenAt),
        })),
      };
    },
  }),

  defineTool({
    name: 'audit_search',
    label: 'Searching the audit log',
    description:
      'Searches the audit log: who did what, when and from which IP. Filter by action (e.g. PAYMENT_VERIFIED, MARKS_VERIFIED, MERIT_LIST_PUBLISHED, ADMISSION_REVOKED), person or text.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.AUDIT_VIEW,
    input: z.object({
      institution: institutionArg,
      action: z.string().max(60).optional(),
      person: z.string().max(80).optional(),
      text: z.string().max(80).optional(),
      days,
    }),
    run: async (
      ctx,
      i: { institution?: string; action?: string; person?: string; text?: string; days?: number },
    ) => {
      const t = await tenantFilter(ctx, i.institution);
      const f: Record<string, unknown> = { ...t, createdAt: { $gte: since(i.days ?? 7) } };
      if (i.action) f.action = new RegExp(escapeRegex(i.action.toUpperCase().replace(/\s+/g, '_')), 'i');
      if (i.person) f.actorName = new RegExp(escapeRegex(i.person), 'i');
      if (i.text)
        f.$or = [
          { action: new RegExp(escapeRegex(i.text), 'i') },
          { entity: new RegExp(escapeRegex(i.text), 'i') },
        ];
      const [items, total] = await Promise.all([
        AuditLogModel.find(f).sort({ createdAt: -1 }).limit(25).lean(),
        AuditLogModel.countDocuments(f),
      ]);
      const names = await institutionNames(items.map((a) => a.institutionId));
      return {
        total,
        shown: items.length,
        entries: items.map((a) => ({
          time: new Date(a.createdAt.getTime() + 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' '),
          person: a.actorName || 'System',
          institution: a.institutionId ? names.get(String(a.institutionId)) : 'Platform',
          action: a.action,
          record: a.entity,
          ip: a.ip,
        })),
      };
    },
  }),

  defineTool({
    name: 'staff_activity',
    label: 'Summarising staff activity',
    description:
      'How many actions each staff member took in the period, by action type (from the audit log).',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.AUDIT_VIEW,
    input: z.object({ institution: institutionArg, days }),
    run: async (ctx, i: { institution?: string; days?: number }) => {
      const t = await tenantFilter(ctx, i.institution);
      const rows = await AuditLogModel.aggregate<{ _id: { actor: string; action: string }; n: number }>([
        { $match: { ...t, actorName: { $nin: ['', null] }, createdAt: { $gte: since(i.days ?? 7) } } },
        { $group: { _id: { actor: '$actorName', action: '$action' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 60 },
      ]);
      const by = new Map<string, Record<string, number>>();
      for (const r of rows) by.set(r._id.actor, { ...(by.get(r._id.actor) ?? {}), [r._id.action]: r.n });
      return [...by.entries()].map(([person, actions]) => ({
        person,
        total: Object.values(actions).reduce((s, n) => s + n, 0),
        actions,
      }));
    },
  }),

  defineTool({
    name: 'support_tickets',
    label: 'Checking support tickets',
    description:
      'Support tickets with status, priority, first-response state (due, overdue, met, missed) and last activity.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.SUPPORT_TICKETS,
    input: z.object({
      status: z
        .enum(['ACTIVE', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_INSTITUTION', 'RESOLVED', 'CLOSED'])
        .optional(),
      institution: institutionArg,
    }),
    run: async (ctx, i: { status?: string; institution?: string }) => {
      const t = await tenantFilter(ctx, i.institution);
      const f: Record<string, unknown> = { ...t };
      if (!i.status || i.status === 'ACTIVE')
        f.status = { $in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_INSTITUTION'] };
      else f.status = i.status;
      const list = await SupportTicketModel.find(f).sort({ lastActivityAt: -1 }).limit(20).lean();
      const names = await institutionNames(list.map((x) => x.institutionId));
      return list.map((x) => ({
        ticket: x.ticketNumber,
        institution: names.get(String(x.institutionId)),
        subject: x.subject,
        priority: x.priority,
        status: x.status,
        firstResponse: responseState(x),
        lastActivity: pktDay(x.lastActivityAt),
        messages: x.messages.length,
      }));
    },
  }),

  defineTool({
    name: 'merit_and_offers',
    label: 'Checking merit lists and offers',
    description:
      'Merit lists of a campaign and, per program and shift, seats, offers, acceptances, enrollments and free seats.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.DASHBOARD_VIEW,
    input: z.object({ institution: institutionArg, campaign: z.string().max(80).optional() }),
    run: async (ctx, i: { institution?: string; campaign?: string }) => {
      const t = await tenantFilter(ctx, i.institution);
      if (ctx.scope === 'PLATFORM' && !t.institutionId) throw new ToolError('Say which institution.');
      const c = await resolveCampaign(t, i.campaign);
      if (!c) return { message: 'No campaign found.' };
      const [lists, offers, programs] = await Promise.all([
        MeritListModel.find({ campaignId: c._id })
          .select('listNumber status revision publishedAt offerDeadline counts')
          .sort({ listNumber: 1 })
          .lean(),
        OfferModel.aggregate<{
          _id: { programId: Types.ObjectId; shift: string; status: string };
          n: number;
        }>([
          { $match: { campaignId: c._id } },
          {
            $group: { _id: { programId: '$programId', shift: '$shift', status: '$status' }, n: { $sum: 1 } },
          },
        ]),
        ProgramModel.find({ _id: { $in: c.programs.map((p) => p.programId) } })
          .select('title shifts')
          .lean(),
      ]);
      return {
        campaign: `${c.title} (${c.code}), ${c.status}`,
        lists: lists.map((l) => ({
          list: l.listNumber,
          status: l.status,
          revision: l.revision,
          published: l.publishedAt ? pktDay(l.publishedAt) : null,
          selected: l.counts?.selected,
          waiting: l.counts?.waitlisted,
        })),
        seats: programs.flatMap((p) =>
          p.shifts.map((s) => {
            const n = (st: string) =>
              offers.find(
                (o) =>
                  String(o._id.programId) === String(p._id) && o._id.shift === s.name && o._id.status === st,
              )?.n ?? 0;
            const taken = n('OFFERED') + n('ACCEPTED') + n('ENROLLED');
            return {
              program: p.title,
              shift: s.name,
              seats: s.seats,
              offered: n('OFFERED'),
              accepted: n('ACCEPTED'),
              enrolled: n('ENROLLED'),
              declinedOrExpired: n('DECLINED') + n('EXPIRED'),
              freeSeats: Math.max(0, s.seats - taken),
            };
          }),
        ),
      };
    },
  }),

  defineTool({
    name: 'find_application',
    label: 'Looking up an application',
    description:
      'Finds applications by application number or applicant name and returns status, programs, marks state, fee and offer. CNIC numbers are masked.',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.APPLICATIONS_REVIEW,
    input: z.object({ query: z.string().min(2).max(80).describe('Application number or applicant name') }),
    run: async (ctx, i: { query: string }) => {
      const t = ctx.scope === 'INSTITUTION' ? { institutionId: ctx.institutionId } : {};
      const rx = new RegExp(escapeRegex(i.query.trim()), 'i');
      const apps = await ApplicationModel.find({
        ...t,
        status: { $ne: 'DRAFT' },
        $or: [{ applicationNumber: rx }, { 'snapshot.profile.fullName': rx }],
      })
        .select(
          'applicationNumber status institutionId applicantId preferences submittedAt snapshot.profile.fullName',
        )
        .limit(8)
        .lean();
      const [programs, names, profiles, records, vouchers, offers] = await Promise.all([
        ProgramModel.find({ _id: { $in: apps.flatMap((a) => a.preferences.map((p) => p.programId)) } })
          .select('title')
          .lean(),
        institutionNames(apps.map((a) => a.institutionId)),
        ProfileModel.find({ userId: { $in: apps.map((a) => a.applicantId) } })
          .select('userId cnic')
          .lean(),
        RecordModel.find({ userId: { $in: apps.map((a) => a.applicantId) }, current: true })
          .select('userId level percentage verificationStatus trustLevel')
          .lean(),
        VoucherModel.find({ applicationId: { $in: apps.map((a) => a._id) } })
          .select('applicationId type status amount')
          .lean(),
        OfferModel.find({ applicationId: { $in: apps.map((a) => a._id) } })
          .select('applicationId status deadline programId')
          .lean(),
      ]);
      return apps.map((a) => ({
        application: a.applicationNumber,
        applicant: (a.snapshot?.profile as { fullName?: string })?.fullName,
        cnic: maskCnic(profiles.find((p) => String(p.userId) === String(a.applicantId))?.cnic),
        institution: names.get(String(a.institutionId)),
        status: a.status,
        submitted: a.submittedAt ? pktDay(a.submittedAt) : null,
        preferences: [...a.preferences]
          .sort((x, y) => x.order - y.order)
          .map(
            (p) =>
              `${programs.find((x) => String(x._id) === String(p.programId))?.title} (${p.shift.toLowerCase()})`,
          ),
        marks: records
          .filter((r) => String(r.userId) === String(a.applicantId))
          .map((r) => `${r.level} ${r.percentage}% ${r.verificationStatus}`),
        fees: vouchers
          .filter((v) => String(v.applicationId) === String(a._id))
          .map((v) => `${v.type} ${money(v.amount)} ${v.status}`),
        offers: offers
          .filter((o) => String(o.applicationId) === String(a._id))
          .map((o) => `${o.status} until ${pktDay(o.deadline)}`),
      }));
    },
  }),

  defineTool({
    name: 'campaign_analytics',
    label: 'Reading the admission funnel',
    description:
      'Admission funnel (submitted, fee paid, verified, offered, accepted, enrolled), demand per seat, fees and document rejection rate of an institution (RPT-1 figures).',
    scope: 'both',
    kind: 'read',
    permission: PERMISSIONS.ANALYTICS_VIEW,
    input: z.object({ institution: institutionArg, campaign: z.string().max(80).optional() }),
    run: async (ctx, i: { institution?: string; campaign?: string }) => {
      const t = await tenantFilter(ctx, i.institution);
      if (!t.institutionId) throw new ToolError('Say which institution.');
      const c = i.campaign ? await resolveCampaign(t, i.campaign) : null;
      const a = await institutionAnalytics(t.institutionId as Types.ObjectId, {
        campaignId: c ? String(c._id) : undefined,
        days: 14,
      });
      return {
        campaign: c ? c.title : 'All campaigns',
        kpis: a.kpis,
        funnel: a.funnel,
        programs: a.programs.slice(0, 10),
        fees: a.fees,
        documents: a.documents,
        marks: { verifiedShare: a.marks.verifiedShare },
      };
    },
  }),

  defineTool({
    name: 'advisor_and_registry',
    label: 'Reading advisor usage and registry match rates',
    description:
      'Admission Advisor usage (runs, fields, programs) and board registry match rates per board (RPT-3).',
    scope: 'platform',
    kind: 'read',
    input: z.object({ days }),
    run: async (_ctx, i: { days?: number }) => {
      const a = await platformAnalytics(i.days ?? 30);
      return {
        advisor: {
          runs: a.advisor.runs,
          perDay: a.advisor.averagePerDay,
          signedIn: `${a.advisor.signedInShare}%`,
          topFields: a.advisor.byField.slice(0, 5),
          topPrograms: a.advisor.topPrograms.slice(0, 5),
        },
        registry: a.registry,
      };
    },
  }),
];
