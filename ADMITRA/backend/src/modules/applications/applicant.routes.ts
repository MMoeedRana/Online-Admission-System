import { Router } from 'express';
import { z } from 'zod';
import { ACTIVE_STATUSES, PAYMENT_METHODS } from '../../constants/applications';
import { SHIFTS } from '../../constants/enums';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { applicationPdf, challanPdf, receiptPdf } from '../../lib/pdf';
import { saveUpload, upload } from '../../lib/storage';
import type { Id } from '../../lib/types';
import { idParams, objectId, parse } from '../../lib/validate';
import { CampaignModel } from '../campaigns/campaign.model';
import { ApplicantDocumentModel, DocumentTypeModel } from '../documents/document.models';
import { PaymentModel, VoucherModel } from '../fees/fee.models';
import { InstitutionModel } from '../institutions/institution.model';
import { NotificationModel } from '../notifications/notification.models';
import { ProfileModel, formatCnic } from '../profile/profile.model';
import { ProgramModel } from '../programs/program.model';
import { RecordModel } from '../records/record.models';
import { ApplicationModel } from './application.model';
import {
  PROGRESS,
  applicationFee,
  contextOf,
  currentRecords,
  eligibilityFor,
  findTransition,
  missingItems,
  pushHistory,
  requiredDocumentTypes,
  submitApplication,
  type AppDoc,
} from './application.service';

export const applicantAppRouter = Router();

async function own(req: { auth?: { userId: string } }, id: string) {
  const app = await ApplicationModel.findOne({ _id: id, applicantId: req.auth!.userId });
  if (!app) throw ApiError.notFound('Application');
  return app as AppDoc;
}

const NEXT_ACTION: Record<string, string> = {
  DRAFT: 'Complete and submit your application',
  PAYMENT_PENDING: 'Pay the application fee and upload the proof',
  UNDER_REVIEW: 'Waiting for the admission office',
  DOCUMENT_VERIFICATION: 'Your documents are being verified',
  DEFICIENT: 'Correct the items in the deficiency notice',
  ELIGIBILITY_CHECK: 'Your eligibility is being reviewed',
  VERIFIED: 'Wait for the merit list',
  REJECTED: 'Application not accepted',
  WITHDRAWN: 'Application withdrawn',
};

applicantAppRouter.get('/', async (req, res) => {
  const apps = await ApplicationModel.find({ applicantId: req.auth!.userId }).sort({ updatedAt: -1 }).lean();
  const [insts, camps, progs, vouchers] = await Promise.all([
    InstitutionModel.find({ _id: { $in: apps.map((a) => a.institutionId) } })
      .select('name shortName city')
      .lean(),
    CampaignModel.find({ _id: { $in: apps.map((a) => a.campaignId) } })
      .select('title closesAt')
      .lean(),
    ProgramModel.find({ _id: { $in: apps.flatMap((a) => a.preferences.map((p) => p.programId)) } })
      .select('title')
      .lean(),
    VoucherModel.find({ applicationId: { $in: apps.map((a) => a._id) } })
      .select('applicationId status amount')
      .lean(),
  ]);
  ok(
    res,
    apps.map((a) => ({
      _id: a._id,
      applicationNumber: a.applicationNumber,
      status: a.status,
      progress: PROGRESS[a.status] ?? 0,
      nextAction: NEXT_ACTION[a.status] ?? '',
      institution: insts.find((i) => String(i._id) === String(a.institutionId)),
      campaign: camps.find((c) => String(c._id) === String(a.campaignId)),
      programs: a.preferences
        .map((p) => progs.find((x) => String(x._id) === String(p.programId))?.title)
        .filter(Boolean),
      voucher: vouchers.find((v) => String(v.applicationId) === String(a._id)) ?? null,
      submittedAt: a.submittedAt,
      updatedAt: a.updatedAt,
    })),
  );
});

/** Starts (or reopens) a draft for an open campaign; APP-2 one active application per campaign. */
applicantAppRouter.post('/', async (req, res) => {
  const body = parse(z.object({ campaignId: objectId, programId: objectId.optional() }), req.body);
  const campaign = await CampaignModel.findById(body.campaignId).lean();
  if (!campaign || campaign.status !== 'OPEN' || campaign.closesAt <= new Date())
    throw ApiError.conflict('This admission campaign is not open.');
  const inst = await InstitutionModel.findOne({ _id: campaign.institutionId, status: 'ACTIVE' }).lean();
  if (!inst) throw ApiError.notFound('Campaign');
  const existing = await ApplicationModel.findOne({
    applicantId: req.auth!.userId,
    campaignId: campaign._id,
    status: { $in: ACTIVE_STATUSES },
  });
  if (existing && (existing.status === 'DRAFT' || campaign.settings?.duplicatePolicy !== 'ALLOW_MULTIPLE')) {
    if (existing.status !== 'DRAFT') {
      throw new ApiError(
        409,
        'DUPLICATE_APPLICATION',
        `You already have application ${existing.applicationNumber} in this campaign.`,
        { applicationId: existing._id },
      );
    }
    return ok(res, existing);
  }
  const prefs = [];
  if (body.programId && campaign.programs.some((p) => String(p.programId) === body.programId)) {
    const prog = await ProgramModel.findById(body.programId).lean();
    if (prog?.status === 'ACTIVE') prefs.push({ programId: prog._id, shift: prog.shifts[0]!.name, order: 1 });
  }
  const app = await ApplicationModel.create({
    institutionId: inst._id,
    campaignId: campaign._id,
    applicantId: req.auth!.userId,
    preferences: prefs,
    status: 'DRAFT',
  });
  await audit(req, 'APPLICATION_DRAFT_CREATED', 'Application', app._id, undefined, {
    institutionId: inst._id,
  });
  created(res, app);
});

/** Everything the wizard and the details page need. */
applicantAppRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  const ctx = await contextOf(app);
  const records = await currentRecords(app.applicantId);
  const [docTypes, docs, vouchers, payments] = await Promise.all([
    requiredDocumentTypes(app.institutionId, ctx.chosen.length ? ctx.chosen : ctx.programs),
    ApplicantDocumentModel.find({ applicationId: app._id })
      .sort({ version: -1 })
      .populate('fileId', 'originalName mimeType size')
      .lean(),
    VoucherModel.find({ applicationId: app._id }).lean(),
    PaymentModel.find({ applicationId: app._id }).sort({ createdAt: -1 }).select('-decidedBy').lean(),
  ]);
  const caps = new Map(ctx.campaign.programs.map((p) => [String(p.programId), p.seatCap]));
  const { missing } = app.status === 'DRAFT' ? await missingItems(app) : { missing: [] };
  const fee = applicationFee(ctx.campaign, ctx.chosen);
  const visible: Record<string, unknown> = app.toObject();
  delete visible.notes;
  ok(res, {
    application: visible,
    progress: PROGRESS[app.status] ?? 0,
    nextAction: NEXT_ACTION[app.status] ?? '',
    institution: {
      _id: ctx.institution._id,
      name: ctx.institution.name,
      shortName: ctx.institution.shortName,
      city: ctx.institution.city,
    },
    campaign: {
      _id: ctx.campaign._id,
      title: ctx.campaign.title,
      code: ctx.campaign.code,
      closesAt: ctx.campaign.closesAt,
      status: ctx.campaign.status,
      settings: ctx.campaign.settings,
    },
    programs: ctx.programs
      .filter((p) => p.status === 'ACTIVE' || ctx.chosen.includes(p))
      .map((p) => ({
        _id: p._id,
        title: p.title,
        code: p.code,
        degreeLevel: p.degreeLevel,
        shifts: p.shifts,
        seatCap: caps.get(String(p._id)) ?? null,
        applicationFee: p.applicationFee,
        eligibility: eligibilityFor(p, records),
      })),
    documentTypes: docTypes,
    documents: docs,
    missing,
    fee,
    vouchers,
    payments,
    canWithdraw: Boolean(findTransition(app.status as never, 'WITHDRAWN', 'APPLICANT')),
  });
});

applicantAppRouter.put('/:id/preferences', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  if (app.status !== 'DRAFT') throw ApiError.conflict('Programs cannot be changed after submission (APP-5).');
  const { preferences } = parse(
    z.object({ preferences: z.array(z.object({ programId: objectId, shift: z.enum(SHIFTS) })).max(10) }),
    req.body,
  );
  const campaign = await CampaignModel.findById(app.campaignId).lean();
  const max = campaign!.settings?.maxPreferences ?? 3;
  if (preferences.length > max)
    throw ApiError.validation(`You can choose at most ${max} preference(s).`, {
      fields: { preferences: `At most ${max}.` },
    });
  const seen = new Set<string>();
  for (const p of preferences) {
    const key = `${p.programId}:${p.shift}`;
    if (seen.has(key))
      throw ApiError.validation('The same program and shift is chosen twice.', {
        fields: { preferences: 'Duplicate choice.' },
      });
    seen.add(key);
    if (!campaign!.programs.some((x) => String(x.programId) === p.programId))
      throw ApiError.validation('This program is not part of the campaign.');
    const prog = await ProgramModel.findById(p.programId).lean();
    if (!prog || prog.status !== 'ACTIVE' || !prog.shifts.some((s) => s.name === p.shift)) {
      throw ApiError.validation(`The ${p.shift.toLowerCase()} shift is not offered for this program.`, {
        fields: { preferences: 'Shift not offered.' },
      });
    }
  }
  app.set(
    'preferences',
    preferences.map((p, i) => ({ ...p, order: i + 1 })),
  );
  await app.save();
  ok(res, app);
});

/** DOC-2: upload a document for a requirement (drafts, or rejected documents of deficient applications). */
applicantAppRouter.post('/:id/documents', upload.single('file'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { documentTypeId } = parse(z.object({ documentTypeId: objectId }), req.body);
  const app = await own(req, id);
  const type = await DocumentTypeModel.findOne({
    _id: documentTypeId,
    institutionId: app.institutionId,
    active: true,
  }).lean();
  if (!type) throw ApiError.notFound('Document type');
  const current = await ApplicantDocumentModel.findOne({
    applicationId: app._id,
    documentTypeId,
    current: true,
  });
  if (app.status !== 'DRAFT') {
    if (app.status !== 'DEFICIENT')
      throw ApiError.conflict('Documents cannot be changed after submission (APP-5).');
    if (current && current.status !== 'REJECTED')
      throw ApiError.conflict('Only rejected documents can be replaced.');
  }
  const file = await saveUpload(req.file, {
    ownerId: req.auth!.userId,
    purpose: 'DOCUMENT',
    formats: type.formats as never,
    maxSizeMB: type.maxSizeMB,
  });
  if (current) {
    current.current = false;
    await current.save();
  }
  const doc = await ApplicantDocumentModel.create({
    applicationId: app._id,
    institutionId: app.institutionId,
    documentTypeId,
    fileId: file._id,
    version: (current?.version ?? 0) + 1,
  });
  await audit(
    req,
    'DOCUMENT_UPLOADED',
    'ApplicantDocument',
    doc._id,
    { type: type.code, version: doc.version },
    { institutionId: app.institutionId },
  );
  created(res, doc);
});

applicantAppRouter.post('/:id/submit', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  const r = await submitApplication(req, app);
  ok(res, { application: r.app, voucher: r.voucher });
});

/** FLOW: the applicant resubmits after correcting a deficiency. */
applicantAppRouter.post('/:id/resubmit', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  if (app.status !== 'DEFICIENT')
    throw ApiError.conflict('Only applications with a deficiency notice can be resubmitted.');
  const rejected = await ApplicantDocumentModel.countDocuments({
    applicationId: app._id,
    current: true,
    status: 'REJECTED',
  });
  if (rejected) throw ApiError.conflict('Replace every rejected document before resubmitting.');
  const ctx = await contextOf(app);
  const records = await currentRecords(app.applicantId);
  if (
    records.some(
      (r) =>
        r.verificationStatus === 'MISMATCH' &&
        ctx.chosen.some((p) => p.eligibility.some((e) => e.level === r.level)),
    )
  ) {
    throw ApiError.conflict('Correct the academic records marked as mismatch before resubmitting.');
  }
  pushHistory(
    app,
    'DOCUMENT_VERIFICATION',
    'APPLICANT',
    { id: req.auth!.userId, name: req.auth!.name },
    'Corrections resubmitted',
  );
  await app.save();
  await audit(req, 'APPLICATION_RESUBMITTED', 'Application', app._id, undefined, {
    institutionId: app.institutionId,
  });
  ok(res, app);
});

applicantAppRouter.post('/:id/withdraw', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  if (!findTransition(app.status as never, 'WITHDRAWN', 'APPLICANT'))
    throw ApiError.conflict('This application can no longer be withdrawn.');
  pushHistory(app, 'WITHDRAWN', 'APPLICANT', { id: req.auth!.userId, name: req.auth!.name });
  await app.save();
  await VoucherModel.updateMany(
    { applicationId: app._id, status: { $in: ['ISSUED', 'AWAITING_VERIFICATION'] } },
    { status: 'CANCELLED' },
  );
  await audit(req, 'APPLICATION_WITHDRAWN', 'Application', app._id, undefined, {
    institutionId: app.institutionId,
  });
  ok(res, app);
});

applicantAppRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  if (app.status !== 'DRAFT')
    throw ApiError.conflict('Only drafts can be deleted. Withdraw a submitted application instead.');
  await ApplicantDocumentModel.deleteMany({ applicationId: app._id });
  await app.deleteOne();
  ok(res, { deleted: true });
});

// ---------------- Fees (FEE-2 to FEE-5) ----------------
export async function challanData(appId: Id) {
  const app = await ApplicationModel.findById(appId).lean();
  const voucher = await VoucherModel.findOne({ applicationId: appId, type: 'APPLICATION' }).lean();
  if (!app || !voucher) throw ApiError.notFound('Challan');
  const [inst, campaign] = await Promise.all([
    InstitutionModel.findById(app.institutionId).lean(),
    CampaignModel.findById(app.campaignId).lean(),
  ]);
  const p = (app.snapshot?.profile ?? {}) as { fullName: string; fatherName: string; cnic: string };
  return {
    institution: { name: inst!.name, city: inst!.city, bankAccount: inst!.bankAccount! },
    voucherNumber: voucher.voucherNumber,
    type: voucher.type,
    issuedAt: voucher.createdAt!,
    dueDate: voucher.dueDate,
    applicant: { name: p.fullName, fatherName: p.fatherName, cnic: formatCnic(p.cnic) },
    applicationNumber: app.applicationNumber!,
    campaign: campaign!.title,
    items: voucher.items.map((i) => ({ label: i.label ?? '', amount: i.amount ?? 0 })),
    amount: voucher.amount,
  };
}

export async function receiptData(paymentId: Id) {
  const pay = await PaymentModel.findById(paymentId).lean();
  if (!pay || pay.status !== 'VERIFIED') throw ApiError.notFound('Receipt');
  const [app, voucher] = await Promise.all([
    ApplicationModel.findById(pay.applicationId).lean(),
    VoucherModel.findById(pay.voucherId).lean(),
  ]);
  const inst = await InstitutionModel.findById(pay.institutionId).lean();
  const p = (app!.snapshot?.profile ?? {}) as { fullName: string; cnic: string };
  return {
    institution: inst!.name,
    receiptNumber: pay.receiptNumber!,
    voucherNumber: voucher!.voucherNumber,
    applicationNumber: app!.applicationNumber!,
    applicant: p.fullName,
    cnic: formatCnic(p.cnic),
    amount: pay.amount,
    method: pay.method,
    reference: pay.reference,
    paidOn: pay.paidOn,
    verifiedAt: pay.decidedAt!,
    verifiedBy: pay.decidedByName || 'Finance office',
  };
}

export async function formData(appId: Id) {
  const app = await ApplicationModel.findById(appId).lean();
  if (!app || !app.applicationNumber) throw ApiError.notFound('Application');
  const [inst, campaign, progs] = await Promise.all([
    InstitutionModel.findById(app.institutionId).lean(),
    CampaignModel.findById(app.campaignId).lean(),
    ProgramModel.find({ _id: { $in: app.preferences.map((p) => p.programId) } })
      .select('title')
      .lean(),
  ]);
  const TRUST_LABEL = ['declared', 'document attached', 'registry verified', 'officer verified'];
  return {
    institution: inst!.name,
    applicationNumber: app.applicationNumber,
    campaign: campaign!.title,
    submittedAt: app.submittedAt ?? null,
    status: app.status,
    profile: {
      ...(app.snapshot?.profile as object),
      cnic: formatCnic(String((app.snapshot?.profile as { cnic?: string })?.cnic ?? '')),
    },
    preferences: app.preferences.map((p) => ({
      order: p.order,
      shift: p.shift,
      program: progs.find((x) => String(x._id) === String(p.programId))?.title ?? '',
    })),
    records: (app.snapshot?.records ?? []).map((r: Record<string, never>) => ({
      level: r.level,
      board: r.board,
      year: r.year,
      rollNo: r.rollNo,
      obtained: r.obtained,
      total: r.total,
      percentage: r.percentage,
      trust: TRUST_LABEL[r.trustLevel] ?? '',
    })),
  };
}

applicantAppRouter.get('/:id/challan.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await own(req, id);
  challanPdf(res, await challanData(id));
});

applicantAppRouter.get('/:id/form.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  await own(req, id);
  applicationPdf(res, await formData(id));
});

applicantAppRouter.get('/:id/payments/:paymentId/receipt.pdf', async (req, res) => {
  const { id, paymentId } = parse(z.object({ id: objectId, paymentId: objectId }), req.params);
  await own(req, id);
  const pay = await PaymentModel.exists({ _id: paymentId, applicationId: id });
  if (!pay) throw ApiError.notFound('Receipt');
  receiptPdf(res, await receiptData(paymentId));
});

/** FEE-2/FEE-3: proof of payment. */
applicantAppRouter.post('/:id/payments', upload.single('file'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const app = await own(req, id);
  const body = parse(
    z.object({
      method: z.enum(PAYMENT_METHODS),
      reference: z
        .string()
        .trim()
        .min(4, 'Enter the transaction or slip reference.')
        .max(40)
        .transform((v) => v.toUpperCase()),
      amount: z.coerce.number().positive(),
      paidOn: z.coerce.date().refine((d) => d <= new Date(), 'The payment date cannot be in the future.'),
    }),
    req.body,
  );
  const voucher = await VoucherModel.findOne({ applicationId: app._id, type: 'APPLICATION' });
  if (!voucher) throw ApiError.notFound('Challan');
  if (voucher.status !== 'ISSUED') {
    throw ApiError.conflict(
      voucher.status === 'PAID'
        ? 'This challan is already paid.'
        : 'A proof of payment is already waiting for verification.',
    );
  }
  if (body.amount !== voucher.amount) {
    throw ApiError.validation(`The amount must be equal to the challan amount (Rs. ${voucher.amount}).`, {
      fields: { amount: `Must be ${voucher.amount}.` },
    });
  }
  if (await PaymentModel.exists({ institutionId: app.institutionId, reference: body.reference })) {
    throw ApiError.conflict('This transaction reference has already been used.', {
      fields: { reference: 'Reference already used.' },
    });
  }
  const file = await saveUpload(req.file, {
    ownerId: req.auth!.userId,
    purpose: 'PAYMENT_PROOF',
    formats: ['PDF', 'JPG', 'PNG'],
    maxSizeMB: 2,
  });
  const pay = await PaymentModel.create({
    ...body,
    institutionId: app.institutionId,
    voucherId: voucher._id,
    applicationId: app._id,
    applicantId: app.applicantId,
    proofFileId: file._id,
  });
  voucher.status = 'AWAITING_VERIFICATION';
  await voucher.save();
  await audit(
    req,
    'PAYMENT_PROOF_SUBMITTED',
    'Payment',
    pay._id,
    { reference: body.reference },
    { institutionId: app.institutionId },
  );
  created(res, pay);
});

// ---------------- Applicant dashboard ----------------
export const applicantDashboardRouter = Router();
applicantDashboardRouter.get('/', async (req, res) => {
  const userId = req.auth!.userId;
  const [profile, records, notifications] = await Promise.all([
    ProfileModel.exists({ userId }),
    RecordModel.find({ userId, current: true })
      .select('level board year percentage trustLevel verificationStatus testName')
      .lean(),
    NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  ok(res, { hasProfile: Boolean(profile), records, notifications });
});
