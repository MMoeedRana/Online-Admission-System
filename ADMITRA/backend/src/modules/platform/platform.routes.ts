import { Router } from 'express';
import { z } from 'zod';
import { INSTITUTION_STATUSES, INSTITUTION_TYPES, PROVINCES, SECTORS } from '../../constants/enums';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { emailSchema, idParams, objectId, parse, phoneSchema } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { AuditLogModel } from '../audit/audit.model';
import { CampaignModel } from '../campaigns/campaign.model';
import { InstitutionModel, subscriptionState } from '../institutions/institution.model';
import { PlanModel } from '../plans/plan.model';
import { ProgramModel } from '../programs/program.model';
import { MemberModel } from '../staff/member.model';
import { CampusModel } from '../structure/structure.models';
import { UserModel } from '../users/user.model';
import * as svc from './platform.service';

export const platformRouter = Router();
platformRouter.use(authenticate, requireSuperAdmin);

// ---------------- Dashboard ----------------
platformRouter.get('/dashboard', async (_req, res) => {
  const [byStatus, applicants, staff, programs, openCampaigns, pending, recent, plans] = await Promise.all([
    InstitutionModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    UserModel.countDocuments({ accountType: 'APPLICANT' }),
    MemberModel.countDocuments({ status: 'ACTIVE' }),
    ProgramModel.countDocuments({ status: 'ACTIVE' }),
    CampaignModel.countDocuments({ status: 'OPEN' }),
    InstitutionModel.find({ status: 'PENDING' })
      .sort({ createdAt: 1 })
      .limit(5)
      .select('name city province type contact createdAt')
      .lean(),
    AuditLogModel.find().sort({ createdAt: -1 }).limit(8).lean(),
    PlanModel.find({ status: 'ACTIVE' }).select('name code').lean(),
  ]);
  const active = await InstitutionModel.find({ status: { $in: ['ACTIVE', 'SUSPENDED'] } })
    .select('name subscription planId status')
    .lean();
  const soon = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const expiring = active
    .filter((i) => i.subscription?.endsAt && i.subscription.endsAt.getTime() < soon)
    .map((i) => ({
      id: String(i._id),
      name: i.name,
      endsAt: i.subscription!.endsAt,
      state: subscriptionState(i),
    }))
    .sort((a, b) => +new Date(a.endsAt!) - +new Date(b.endsAt!));
  const planUsage = plans.map((p) => ({
    name: p.name,
    count: active.filter((i) => String(i.planId) === String(p._id)).length,
  }));
  const counts = Object.fromEntries(
    INSTITUTION_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.count ?? 0]),
  );
  ok(res, {
    counts,
    applicants,
    staff,
    programs,
    openCampaigns,
    pending,
    recentActivity: recent,
    expiring,
    planUsage,
  });
});

// ---------------- Plans ----------------
const planBody = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, - or _'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(''),
  priceMonthly: z.coerce.number().min(0),
  trialDays: z.coerce.number().int().min(0).max(365).default(30),
  limits: z.object({
    campuses: z.coerce.number().int().min(1),
    programs: z.coerce.number().int().min(1),
    staff: z.coerce.number().int().min(1),
    applicationsPerCycle: z.coerce.number().int().min(1),
  }),
  features: z.object({
    multipleCampuses: z.boolean().default(false),
    customBranding: z.boolean().default(false),
    advancedAnalytics: z.boolean().default(false),
    apiAccess: z.boolean().default(false),
  }),
  status: z.enum(['ACTIVE', 'RETIRED']).default('ACTIVE'),
});

platformRouter.get('/plans', async (_req, res) => {
  const plans = await PlanModel.find().sort({ priceMonthly: 1 }).lean();
  const usage = await InstitutionModel.aggregate([
    { $match: { planId: { $ne: null } } },
    { $group: { _id: '$planId', count: { $sum: 1 } } },
  ]);
  ok(
    res,
    plans.map((p) => ({
      ...p,
      institutions: usage.find((u) => String(u._id) === String(p._id))?.count ?? 0,
    })),
  );
});

platformRouter.post('/plans', async (req, res) => {
  const body = parse(planBody, req.body);
  const plan = await PlanModel.create(body);
  await audit(req, 'PLAN_CREATED', 'SubscriptionPlan', plan._id, body);
  created(res, plan);
});

platformRouter.patch('/plans/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(planBody.partial(), req.body);
  const plan = await PlanModel.findByIdAndUpdate(id, body, { returnDocument: 'after', runValidators: true });
  if (!plan) throw ApiError.notFound('Plan');
  await audit(req, 'PLAN_UPDATED', 'SubscriptionPlan', plan._id, body);
  ok(res, plan);
});

// ---------------- Institutions ----------------
platformRouter.get('/institutions', async (req, res) => {
  const q = parse(paginationQuery.extend({ status: z.enum(INSTITUTION_STATUSES).optional() }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.q)
    filter.$or = [
      { name: { $regex: escapeRegex(q.q), $options: 'i' } },
      { city: { $regex: escapeRegex(q.q), $options: 'i' } },
    ];
  const [items, total] = await Promise.all([
    InstitutionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('planId', 'name code')
      .lean(),
    InstitutionModel.countDocuments(filter),
  ]);
  ok(
    res,
    items.map((i) => ({ ...i, subscriptionState: subscriptionState(i) })),
    pageMeta(q.page, q.limit, total),
  );
});

platformRouter.get('/institutions/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const inst = await InstitutionModel.findById(id).populate('planId').lean();
  if (!inst) throw ApiError.notFound('Institution');
  const [members, programs, campuses, campaigns] = await Promise.all([
    MemberModel.find({ institutionId: id }).select('email fullName roles status').lean(),
    ProgramModel.countDocuments({ institutionId: id, status: 'ACTIVE' }),
    CampusModel.countDocuments({ institutionId: id }),
    CampaignModel.countDocuments({ institutionId: id }),
  ]);
  ok(res, {
    ...inst,
    subscriptionState: subscriptionState(inst),
    members,
    usage: { programs, campuses, campaigns, staff: members.length },
  });
});

const createInstitutionBody = z.object({
  name: z.string().trim().min(3).max(150),
  shortName: z.string().trim().min(2).max(10),
  type: z.enum(INSTITUTION_TYPES),
  sector: z.enum(SECTORS),
  city: z.string().trim().min(2).max(60),
  province: z.enum(PROVINCES),
  website: z.string().trim().url().or(z.literal('')).default(''),
  contact: z.object({
    name: z.string().trim().min(3).max(120),
    designation: z.string().trim().max(80).default(''),
    email: emailSchema,
    phone: phoneSchema.default(''),
  }),
  planId: objectId,
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
});

/** INST-1: the super admin can also create an institution directly. */
platformRouter.post('/institutions', async (req, res) => {
  const body = parse(createInstitutionBody, req.body);
  const inst = await InstitutionModel.create({
    ...body,
    planId: null,
    slug: await svc.uniqueSlug(body.name),
    email: body.contact.email,
    status: 'PENDING',
  });
  await audit(
    req,
    'INSTITUTION_CREATED',
    'Institution',
    inst._id,
    { name: inst.name },
    { institutionId: inst._id },
  );
  created(res, await svc.approveInstitution(req, String(inst._id), body.planId, body.trialDays));
});

platformRouter.post('/institutions/:id/approve', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(
    z.object({ planId: objectId, trialDays: z.coerce.number().int().min(0).max(365).optional() }),
    req.body,
  );
  ok(res, await svc.approveInstitution(req, id, body.planId, body.trialDays));
});

platformRouter.post('/institutions/:id/reject', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason } = parse(
    z.object({ reason: z.string().trim().min(5, 'Please write a reason.').max(500) }),
    req.body,
  );
  ok(res, await svc.rejectInstitution(req, id, reason));
});

platformRouter.post('/institutions/:id/suspend', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason } = parse(
    z.object({ reason: z.string().trim().min(5, 'Please write a reason.').max(500) }),
    req.body,
  );
  ok(res, await svc.setSuspended(req, id, true, reason));
});

platformRouter.post('/institutions/:id/reactivate', async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await svc.setSuspended(req, id, false));
});

platformRouter.post('/institutions/:id/renew', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(
    z.object({ months: z.coerce.number().int().min(1).max(36), planId: objectId.optional() }),
    req.body,
  );
  ok(res, await svc.renewSubscription(req, id, body.months, body.planId));
});

platformRouter.post('/institutions/:id/resend-admin-invite', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const inst = await InstitutionModel.findById(id).lean();
  if (!inst) throw ApiError.notFound('Institution');
  const member = await MemberModel.findOne({
    institutionId: id,
    status: 'INVITED',
    roles: 'INSTITUTION_ADMIN',
  });
  if (!member) throw ApiError.conflict('There is no pending admin invitation for this institution.');
  await svc.sendInvitation(member, inst.name);
  ok(res, { sent: true });
});

// ---------------- Audit log ----------------
platformRouter.get('/audit-logs', async (req, res) => {
  const q = parse(paginationQuery.extend({ institutionId: objectId.optional() }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.institutionId) filter.institutionId = q.institutionId;
  if (q.q) filter.action = { $regex: escapeRegex(q.q), $options: 'i' };
  const [items, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  ok(res, items, pageMeta(q.page, q.limit, total));
});
