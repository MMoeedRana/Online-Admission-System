import { Router, type Request } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { ApiError, ok } from '../../lib/http';
import { pageMeta, paginationQuery } from '../../lib/pagination';
import { idParams, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicationModel } from '../applications/application.model';
import { scopeFilter } from '../applications/staff.routes';
import { InstitutionModel } from '../institutions/institution.model';
import { notify } from '../notifications/notify';
import { ProfileModel } from '../profile/profile.model';
import { RegistryRowModel } from '../registry/registry.models';
import { UserModel } from '../users/user.model';
import { FraudFlagModel, RecordModel, VerificationModel } from './record.models';
import { checkIntegrity, officerDecision, type RecordInput } from './record.service';

export const verificationRouter = Router();
verificationRouter.use(requirePermission(PERMISSIONS.MARKS_VERIFY));

async function applicantsInScope(req: Request) {
  return ApplicationModel.find(await scopeFilter(req)).distinct('applicantId');
}

verificationRouter.get('/', async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      status: z.enum(['UNDER_VERIFICATION', 'MISMATCH', 'DECLARED', 'AUTO_VERIFIED', 'VERIFIED']).optional(),
    }),
    req.query,
  );
  const applicants = await applicantsInScope(req);
  const filter: Record<string, unknown> = {
    userId: { $in: applicants },
    current: true,
    verificationStatus: q.status ?? { $in: ['UNDER_VERIFICATION', 'MISMATCH', 'DECLARED'] },
  };
  const [items, total, flags, profiles] = await Promise.all([
    RecordModel.find(filter)
      .sort({ updatedAt: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    RecordModel.countDocuments(filter),
    FraudFlagModel.find({ status: 'OPEN', userIds: { $in: applicants } }).lean(),
    ProfileModel.find({ userId: { $in: applicants } })
      .select('userId fullName cnic')
      .lean(),
  ]);
  const counts = await RecordModel.aggregate([
    { $match: { userId: { $in: applicants }, current: true } },
    { $group: { _id: '$verificationStatus', n: { $sum: 1 } } },
  ]);
  ok(
    res,
    items.map((r) => ({
      ...r,
      applicantName: profiles.find((p) => String(p.userId) === String(r.userId))?.fullName ?? r.studentName,
      flagged: flags.some((f) => f.userIds.some((u) => String(u) === String(r.userId))),
    })),
    { ...pageMeta(q.page, q.limit, total), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) },
  );
});

async function loadRecord(req: Request, id: string) {
  const rec = await RecordModel.findById(id);
  if (!rec) throw ApiError.notFound('Record');
  const applicants = await applicantsInScope(req);
  if (!applicants.some((a) => String(a) === String(rec.userId))) throw ApiError.notFound('Record');
  return rec;
}

verificationRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const rec = await loadRecord(req, id);
  const official = await RegistryRowModel.findOne({
    board: rec.board,
    level: rec.level,
    year: rec.year,
    rollNo: rec.rollNo,
    ...(rec.level === 'ENTRY_TEST' ? {} : { institutionId: null }),
  })
    .select('-batchId -institutionId')
    .lean();
  const [history, flags, profile] = await Promise.all([
    VerificationModel.find({ recordId: rec._id })
      .sort({ createdAt: -1 })
      .populate('decidedBy', 'fullName')
      .lean(),
    FraudFlagModel.find({ status: 'OPEN', userIds: rec.userId }).lean(),
    ProfileModel.findOne({ userId: rec.userId }).select('fullName fatherName cnic').lean(),
  ]);
  const integrity = checkIntegrity(rec.toObject() as unknown as RecordInput);
  ok(res, {
    record: rec.toObject(),
    official,
    history,
    flags,
    profile,
    integrity: { errors: integrity.errors, flags: rec.flags },
  });
});

verificationRouter.post('/:id/decision', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(
    z.object({
      decision: z.enum(['VERIFIED', 'MISMATCH']),
      note: z.string().trim().min(5, 'Write a note for the audit trail.').max(1000),
    }),
    req.body,
  );
  const rec = await loadRecord(req, id);
  await officerDecision(req, rec, body.decision, body.note);
  const [user, inst] = await Promise.all([
    UserModel.findById(rec.userId).select('email fullName').lean(),
    InstitutionModel.findById(req.tenant!.institutionId).select('name').lean(),
  ]);
  const vars = { applicantName: user!.fullName, institutionName: inst!.name, note: body.note };
  if (body.decision === 'VERIFIED') {
    await notify(
      rec.userId,
      {
        type: 'MARKS_VERIFIED',
        title: 'Marks verified',
        body: `Your ${rec.level.toLowerCase().replace('_', ' ')} record is verified and locked.`,
        link: '/applicant/records',
      },
      { to: user!.email, key: 'MARKS_VERIFIED', institutionId: req.tenant!.institutionId, vars },
    );
  } else {
    await notify(
      rec.userId,
      { type: 'MARKS_MISMATCH', title: 'Marks need correction', body: body.note, link: '/applicant/records' },
      { to: user!.email, key: 'MARKS_MISMATCH', institutionId: req.tenant!.institutionId, vars },
    );
  }
  ok(res, rec);
});

verificationRouter.post('/flags/:id/resolve', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const applicants = await applicantsInScope(req);
  const flag = await FraudFlagModel.findOneAndUpdate(
    { _id: id, userIds: { $in: applicants } },
    { status: 'RESOLVED' },
    { returnDocument: 'after' },
  );
  if (!flag) throw ApiError.notFound('Flag');
  ok(res, flag);
});
