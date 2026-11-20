import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, ok } from '../../lib/http';
import { emailSchema, parse, phoneSchema } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { CampaignModel } from '../campaigns/campaign.model';
import { ProgramModel, totalSeats } from '../programs/program.model';
import { MemberModel } from '../staff/member.model';
import { AcademicSessionModel, DepartmentModel } from '../structure/structure.models';
import { ApplicationModel } from '../applications/application.model';
import { PaymentModel } from '../fees/fee.models';
import { RecordModel } from '../records/record.models';
import { InstitutionModel } from './institution.model';
import { planOf, usageOf } from './limits';

export const institutionRouter = Router();

institutionRouter.get('/profile', async (req, res) => {
  const inst = await InstitutionModel.findById(req.tenant!.institutionId).lean();
  ok(res, inst);
});

const profileBody = z.object({
  about: z.string().trim().max(2000).optional(),
  website: z.string().trim().url('Enter a full URL starting with https://').or(z.literal('')).optional(),
  email: emailSchema.or(z.literal('')).optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().max(300).optional(),
  branding: z
    .object({
      primaryColor: z
        .string()
        .regex(/^(#[0-9A-Fa-f]{6})?$/, 'Use a hex colour like #1A62D6')
        .optional(),
      sidebarColor: z
        .string()
        .regex(/^(#[0-9A-Fa-f]{6})?$/, 'Use a hex colour like #0B1B3A')
        .optional(),
    })
    .optional(),
  bankAccount: z
    .object({
      bankName: z.string().trim().max(80),
      accountTitle: z.string().trim().max(120),
      accountNumber: z.string().trim().max(40),
      iban: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^(PK\d{2}[A-Z]{4}\d{16})?$/, 'Enter a valid Pakistani IBAN (PK + 22 characters).'),
    })
    .optional(),
  settings: z
    .object({ eligibilityAsSeparateStep: z.boolean().optional(), requireOriginals: z.boolean().optional() })
    .optional(),
});

institutionRouter.patch('/profile', requirePermission(PERMISSIONS.INSTITUTION_SETTINGS), async (req, res) => {
  const body = parse(profileBody, req.body);
  if (body.branding) {
    const plan = await planOf(req.tenant!.institution);
    if (!plan.features!.customBranding) {
      throw new ApiError(403, 'PLAN_FEATURE', `Custom branding is not included in the ${plan.name} plan.`);
    }
  }
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) if (v2 !== undefined) update[`${k}.${k2}`] = v2;
    } else if (v !== undefined) update[k] = v;
  }
  const inst = await InstitutionModel.findByIdAndUpdate(
    req.tenant!.institutionId,
    { $set: update },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  await audit(
    req,
    'INSTITUTION_SETTINGS_UPDATED',
    'Institution',
    req.tenant!.institutionId,
    Object.keys(update),
  );
  ok(res, inst);
});

institutionRouter.get('/subscription', async (req, res) => {
  const inst = req.tenant!.institution as { _id: unknown; planId: unknown; subscription?: unknown };
  const plan = await planOf(inst);
  ok(res, {
    plan,
    usage: await usageOf(inst._id as string),
    subscription: inst.subscription,
    state: req.tenant!.subscription,
  });
});

institutionRouter.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const institutionId = req.tenant!.institutionId;
  const [programs, campaigns, staff, departments, session] = await Promise.all([
    ProgramModel.find({ institutionId, status: 'ACTIVE' }).populate('departmentId', 'name').lean(),
    CampaignModel.find({ institutionId }).sort({ opensAt: -1 }).lean(),
    MemberModel.countDocuments({ institutionId, status: 'ACTIVE' }),
    DepartmentModel.countDocuments({ institutionId }),
    AcademicSessionModel.findOne({ institutionId, isCurrent: true }).lean(),
  ]);
  const open = campaigns.filter((c) => c.status === 'OPEN');
  const submitted = await ApplicationModel.find({ institutionId, status: { $ne: 'DRAFT' } })
    .sort({ submittedAt: -1 })
    .select('applicantId applicationNumber status submittedAt preferences snapshot.profile.fullName')
    .lean();
  const applicantIds = [...new Set(submitted.map((a) => String(a.applicantId)))];
  const records = await RecordModel.find({ userId: { $in: applicantIds }, current: true })
    .select('userId trustLevel verificationStatus')
    .lean();
  const verifiedRecords = records.filter((r) => r.trustLevel >= 2).length;
  const fee = await PaymentModel.aggregate([
    { $match: { institutionId: req.tenant!.institution._id, status: 'VERIFIED' } },
    { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } },
  ]);
  const recentApps = submitted.slice(0, 6);
  const progTitles = await ProgramModel.find({
    _id: { $in: recentApps.map((a) => a.preferences[0]?.programId) },
  })
    .select('title')
    .lean();
  const marksOf = (uid: unknown) => {
    const rs = records.filter((r) => String(r.userId) === String(uid));
    if (rs.some((r) => r.verificationStatus === 'MISMATCH')) return 'MISMATCH';
    if (rs.length && rs.every((r) => r.trustLevel >= 2)) return 'VERIFIED';
    return 'PENDING';
  };
  const seats = programs.reduce((s, p) => s + totalSeats(p), 0);
  const byLevel: Record<string, number> = {};
  for (const p of programs) byLevel[p.degreeLevel] = (byLevel[p.degreeLevel] ?? 0) + totalSeats(p);
  ok(res, {
    kpis: { programs: programs.length, seats, openCampaigns: open.length, staff, departments },
    applications: {
      submitted: submitted.length,
      verifiedRecords,
      totalRecords: records.length,
      feeCollected: fee[0]?.total ?? 0,
      paymentsVerified: fee[0]?.n ?? 0,
      verified: submitted.filter((a) => a.status === 'VERIFIED').length,
    },
    recentApplications: recentApps.map((a) => ({
      id: String(a._id),
      applicationNumber: a.applicationNumber,
      applicant: (a.snapshot?.profile as { fullName?: string })?.fullName ?? '',
      program: progTitles.find((p) => String(p._id) === String(a.preferences[0]?.programId))?.title ?? '',
      status: a.status,
      marks: marksOf(a.applicantId),
    })),
    currentSession: session?.name ?? null,
    seatsByLevel: Object.entries(byLevel).map(([level, value]) => ({ level, seats: value })),
    campaigns: campaigns.slice(0, 6).map((c) => ({
      id: String(c._id),
      title: c.title,
      code: c.code,
      status: c.status,
      opensAt: c.opensAt,
      closesAt: c.closesAt,
      programs: c.programs.length,
    })),
    recentPrograms: programs
      .sort((a, b) => +b.createdAt! - +a.createdAt!)
      .slice(0, 5)
      .map((p) => ({
        id: String(p._id),
        title: p.title,
        code: p.code,
        degreeLevel: p.degreeLevel,
        seats: totalSeats(p),
        department: (p.departmentId as unknown as { name?: string })?.name ?? '',
      })),
  });
});
