import { Router, type Request } from 'express';
import { z } from 'zod';
import { APPLICATION_STATUSES, TRANSITIONS, type ApplicationStatus } from '../../constants/applications';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { applicationPdf, challanPdf } from '../../lib/pdf';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicantDocumentModel } from '../documents/document.models';
import { PaymentModel, VoucherModel } from '../fees/fee.models';
import { ProfileModel } from '../profile/profile.model';
import { ProgramModel } from '../programs/program.model';
import { FraudFlagModel, RecordModel } from '../records/record.models';
import { UserModel } from '../users/user.model';
import { ApplicationModel } from './application.model';
import { challanData, formData } from './applicant.routes';
import {
  contextOf,
  eligibilityFor,
  requiredDocumentTypes,
  staffTransition,
  type AppDoc,
} from './application.service';

export const staffAppRouter = Router();
staffAppRouter.use(
  requirePermission(PERMISSIONS.APPLICATIONS_REVIEW, PERMISSIONS.PAYMENTS_VERIFY, PERMISSIONS.MERIT_MANAGE),
);

/** HOD officers only see applications of their departments. */
export async function scopeFilter(req: Request): Promise<Record<string, unknown>> {
  const t = req.tenant!;
  const filter: Record<string, unknown> = { institutionId: t.institutionId, status: { $ne: 'DRAFT' } };
  const fullAccess = t.roles.some((r) => r !== 'HOD_OFFICER');
  if (!fullAccess) {
    const programs = await ProgramModel.find({
      institutionId: t.institutionId,
      departmentId: { $in: t.departmentIds },
    }).distinct('_id');
    filter['preferences.programId'] = { $in: programs };
  }
  return filter;
}

async function load(req: Request, id: string) {
  const filter = await scopeFilter(req);
  const app = await ApplicationModel.findOne({ ...filter, _id: id });
  if (!app) throw ApiError.notFound('Application');
  return app as AppDoc;
}

/** Worst marks state of an applicant, shown in the queue's marks column. */
function marksState(records: { verificationStatus: string; trustLevel: number }[]) {
  if (!records.length) return 'NONE';
  if (records.some((r) => r.verificationStatus === 'MISMATCH')) return 'MISMATCH';
  if (records.some((r) => r.verificationStatus === 'UNDER_VERIFICATION' || r.trustLevel < 2))
    return 'PENDING';
  return 'VERIFIED';
}

staffAppRouter.get('/', async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      status: z.enum(APPLICATION_STATUSES).optional(),
      campaignId: objectId.optional(),
      programId: objectId.optional(),
      departmentId: objectId.optional(),
      marks: z.enum(['VERIFIED', 'PENDING', 'MISMATCH', 'FLAGGED']).optional(),
    }),
    req.query,
  );
  const filter = await scopeFilter(req);
  if (q.status) filter.status = q.status;
  if (q.campaignId) filter.campaignId = q.campaignId;
  if (q.programId) filter['preferences.programId'] = q.programId;
  if (q.departmentId) {
    const ids = await ProgramModel.find({
      institutionId: req.tenant!.institutionId,
      departmentId: q.departmentId,
    }).distinct('_id');
    filter['preferences.programId'] = { $in: ids };
  }
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [
      { applicationNumber: rx },
      { 'snapshot.profile.fullName': rx },
      { 'snapshot.profile.cnic': rx },
    ];
  }
  if (q.marks) {
    const applicants = await ApplicationModel.find(filter).distinct('applicantId');
    let keep: unknown[];
    if (q.marks === 'FLAGGED')
      keep = await FraudFlagModel.find({ status: 'OPEN', userIds: { $in: applicants } }).distinct('userIds');
    else {
      const recs = await RecordModel.find({ userId: { $in: applicants }, current: true })
        .select('userId verificationStatus trustLevel')
        .lean();
      const byUser = new Map<string, typeof recs>();
      for (const r of recs) byUser.set(String(r.userId), [...(byUser.get(String(r.userId)) ?? []), r]);
      keep = applicants.filter((u) => marksState(byUser.get(String(u)) ?? []) === q.marks);
    }
    filter.applicantId = { $in: keep };
  }
  const base = await scopeFilter(req);
  const [items, total, counts] = await Promise.all([
    ApplicationModel.find(filter)
      .sort({ submittedAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .select('-notes -history')
      .lean(),
    ApplicationModel.countDocuments(filter),
    ApplicationModel.find(base).select('status').lean(),
  ]);
  const [progs, recs, flags] = await Promise.all([
    ProgramModel.find({ _id: { $in: items.flatMap((a) => a.preferences.map((p) => p.programId)) } })
      .select('title code')
      .lean(),
    RecordModel.find({ userId: { $in: items.map((a) => a.applicantId) }, current: true })
      .select('userId verificationStatus trustLevel')
      .lean(),
    FraudFlagModel.find({ status: 'OPEN', userIds: { $in: items.map((a) => a.applicantId) } })
      .select('userIds')
      .lean(),
  ]);
  ok(
    res,
    items.map((a) => ({
      _id: a._id,
      applicationNumber: a.applicationNumber,
      status: a.status,
      submittedAt: a.submittedAt,
      applicant: { name: (a.snapshot?.profile as { fullName?: string })?.fullName ?? '' },
      programs: a.preferences
        .map((p) => progs.find((x) => String(x._id) === String(p.programId)))
        .filter(Boolean),
      marks: marksState(recs.filter((r) => String(r.userId) === String(a.applicantId))),
      flagged: flags.some((f) => f.userIds.some((u) => String(u) === String(a.applicantId))),
    })),
    {
      ...pageMeta(q.page, q.limit, total),
      counts: counts.reduce<Record<string, number>>(
        (m, a) => ((m[a.status] = (m[a.status] ?? 0) + 1), m),
        {},
      ),
    },
  );
});

staffAppRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await load(req, id);
  const ctx = await contextOf(app);
  const [user, profile, records, docTypes, docs, vouchers, payments, flags] = await Promise.all([
    UserModel.findById(app.applicantId).select('email fullName').lean(),
    ProfileModel.findOne({ userId: app.applicantId }).lean(),
    RecordModel.find({ userId: app.applicantId, current: true }).lean(),
    requiredDocumentTypes(app.institutionId, ctx.chosen),
    ApplicantDocumentModel.find({ applicationId: app._id })
      .sort({ version: -1 })
      .populate('fileId', 'originalName mimeType size')
      .lean(),
    VoucherModel.find({ applicationId: app._id }).lean(),
    PaymentModel.find({ applicationId: app._id }).sort({ createdAt: -1 }).lean(),
    FraudFlagModel.find({ status: 'OPEN', userIds: app.applicantId }).lean(),
  ]);
  const separate = ctx.institution.settings?.eligibilityAsSeparateStep ?? true;
  const actions = TRANSITIONS.filter(
    (t) =>
      t.actor === 'STAFF' &&
      t.from.includes(app.status as ApplicationStatus) &&
      (!t.permission || req.tenant!.permissions.includes(t.permission)) &&
      !(t.to === 'ELIGIBILITY_CHECK' && !separate) &&
      !(t.to === 'VERIFIED' && app.status === 'DOCUMENT_VERIFICATION' && separate),
  ).map((t) => ({ to: t.to, label: t.label, noteRequired: Boolean(t.noteRequired) }));
  ok(res, {
    application: app.toObject(),
    applicant: { email: user?.email, profile },
    campaign: { _id: ctx.campaign._id, title: ctx.campaign.title, settings: ctx.campaign.settings },
    preferences: app.toObject().preferences.map((p) => {
      const prog = ctx.programs.find((x) => String(x._id) === String(p.programId));
      return {
        ...p,
        program: prog ? { _id: prog._id, title: prog.title, code: prog.code } : null,
        eligibility: prog ? eligibilityFor(prog, records as never) : null,
      };
    }),
    records,
    documentTypes: docTypes,
    documents: docs,
    vouchers,
    payments,
    flags,
    actions,
    canReviewDocuments:
      app.status === 'DOCUMENT_VERIFICATION' &&
      req.tenant!.permissions.includes(PERMISSIONS.APPLICATIONS_REVIEW),
  });
});

staffAppRouter.post(
  '/:id/transition',
  requirePermission(PERMISSIONS.APPLICATIONS_REVIEW),
  async (req, res) => {
    const { id } = parse(idParams, req.params);
    const body = parse(
      z.object({ to: z.enum(APPLICATION_STATUSES), note: z.string().trim().max(2000).default('') }),
      req.body,
    );
    const app = await load(req, id);
    ok(res, await staffTransition(req, app, body.to, body.note));
  },
);

/** DOC-4: approve or reject one document with a reason. */
staffAppRouter.post(
  '/:id/documents/:docId/review',
  requirePermission(PERMISSIONS.APPLICATIONS_REVIEW),
  async (req, res) => {
    const { id, docId } = parse(z.object({ id: objectId, docId: objectId }), req.params);
    const body = parse(
      z.object({
        decision: z.enum(['APPROVED', 'REJECTED']),
        reason: z.string().trim().max(500).default(''),
      }),
      req.body,
    );
    const app = await load(req, id);
    if (app.status !== 'DOCUMENT_VERIFICATION')
      throw ApiError.conflict('Documents can be reviewed only during document verification (FLOW-3).');
    if (body.decision === 'REJECTED' && body.reason.length < 5)
      throw ApiError.validation('Write the reason for rejection.', {
        fields: { reason: 'A reason is required.' },
      });
    const doc = await ApplicantDocumentModel.findOne({ _id: docId, applicationId: app._id, current: true });
    if (!doc) throw ApiError.notFound('Document');
    doc.status = body.decision;
    doc.reviewTrail.push({
      decision: body.decision,
      reason: body.reason,
      reviewer: req.auth!.userId as never,
      reviewerName: req.auth!.name,
      at: new Date(),
    });
    await doc.save();
    await audit(req, `DOCUMENT_${body.decision}`, 'ApplicantDocument', doc._id, { reason: body.reason });
    ok(res, doc);
  },
);

staffAppRouter.post('/:id/notes', requirePermission(PERMISSIONS.APPLICATIONS_REVIEW), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { text } = parse(z.object({ text: z.string().trim().min(2).max(2000) }), req.body);
  const app = await load(req, id);
  app.notes.push({ text, by: req.auth!.userId as never, byName: req.auth!.name, at: new Date() });
  await app.save();
  ok(res, app.notes);
});

staffAppRouter.get('/:id/challan.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await load(req, id);
  const { type } = parse(
    z.object({ type: z.enum(['APPLICATION', 'ADMISSION']).default('APPLICATION') }),
    req.query,
  );
  challanPdf(res, await challanData(id, type));
});

staffAppRouter.get('/:id/form.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await load(req, id);
  applicationPdf(res, await formData(id));
});
