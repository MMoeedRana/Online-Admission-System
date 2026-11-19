import type { Request } from 'express';
import type { ClientSession, HydratedDocument } from 'mongoose';
import { TRUST } from '../../constants/academics';
import { TRANSITIONS, type Actor, type ApplicationStatus } from '../../constants/applications';
import { audit } from '../../lib/audit';
import { nextSeq, pad } from '../../lib/counter';
import { withTransaction } from '../../lib/db';
import { ApiError } from '../../lib/http';
import type { Id } from '../../lib/types';
import { CampaignModel, type Campaign } from '../campaigns/campaign.model';
import { ApplicantDocumentModel, DocumentTypeModel } from '../documents/document.models';
import { VoucherModel } from '../fees/fee.models';
import { InstitutionModel } from '../institutions/institution.model';
import { planOf } from '../institutions/limits';
import { notify } from '../notifications/notify';
import { ProfileModel, formatCnic } from '../profile/profile.model';
import { ProgramModel, type Program } from '../programs/program.model';
import { RecordModel } from '../records/record.models';
import { CampusModel } from '../structure/structure.models';
import { UserModel } from '../users/user.model';
import { ApplicationModel, type Application } from './application.model';

export type AppDoc = HydratedDocument<Application>;
type ProgramDoc = Program & { _id: unknown };
type RecordLean = {
  _id: unknown;
  level: string;
  testName?: string | null;
  group?: string | null;
  percentage: number;
  subjects: { name: string }[];
  trustLevel: number;
  verificationStatus: string;
  resultCardFileId?: unknown;
};

const LEVEL_LABEL: Record<string, string> = {
  MATRIC: 'Matric / O-Level',
  INTERMEDIATE: 'Intermediate / A-Level',
  BACHELOR_14: "Bachelor's (14 years)",
  BACHELOR_16: "Bachelor's (16 years)",
  MASTER: "Master's",
  ENTRY_TEST: 'Entry test',
};

export const currentRecords = (userId: Id) =>
  RecordModel.find({ userId, current: true }).lean() as unknown as Promise<RecordLean[]>;

/** APP-1: whether the applicant meets each requirement of a program, and why not. */
export function eligibilityFor(program: Pick<ProgramDoc, 'eligibility'>, records: RecordLean[]) {
  const checks = (program.eligibility ?? []).map((rule) => {
    const rec = records.find((r) => r.level === rule.level);
    const label = LEVEL_LABEL[rule.level] ?? rule.level;
    if (!rec) return { level: rule.level, label, ok: false, reason: `Add your ${label} result.` };
    if (rec.percentage < rule.minPercentage) {
      return {
        level: rule.level,
        label,
        ok: false,
        reason: `${label}: ${rec.percentage}% is below the minimum of ${rule.minPercentage}%.`,
      };
    }
    if (
      rule.groups?.length &&
      !rule.groups.some((g) => g.toLowerCase() === (rec.group ?? '').toLowerCase())
    ) {
      return {
        level: rule.level,
        label,
        ok: false,
        reason: `${label}: group must be ${rule.groups.join(' or ')}.`,
      };
    }
    const names = rec.subjects.map((s) => s.name.toLowerCase());
    const missingSubjects = (rule.subjects ?? []).filter(
      (s) => !names.some((n) => n.includes(s.toLowerCase())),
    );
    if (missingSubjects.length)
      return {
        level: rule.level,
        label,
        ok: false,
        reason: `${label}: required subject(s) ${missingSubjects.join(', ')} missing.`,
      };
    return {
      level: rule.level,
      label,
      ok: true,
      reason: `${label}: ${rec.percentage}% meets the minimum of ${rule.minPercentage}%.`,
    };
  });
  return { eligible: checks.every((c) => c.ok), checks };
}

/** Records that a program's eligibility depends on (used for MARK-6 and FLOW-4). */
export function relevantRecords(programs: Pick<ProgramDoc, 'eligibility'>[], records: RecordLean[]) {
  const levels = new Set(programs.flatMap((p) => (p.eligibility ?? []).map((e) => e.level)));
  return records.filter((r) => levels.has(r.level as never));
}

export async function contextOf(app: {
  campaignId: unknown;
  institutionId: unknown;
  preferences: { programId: unknown }[];
}) {
  const [campaign, institution] = await Promise.all([
    CampaignModel.findById(app.campaignId).lean(),
    InstitutionModel.findById(app.institutionId).lean(),
  ]);
  if (!campaign || !institution) throw ApiError.notFound('Campaign');
  const programs = (await ProgramModel.find({
    _id: { $in: campaign.programs.map((p) => p.programId) },
  }).lean()) as unknown as ProgramDoc[];
  const chosen = app.preferences
    .map((p) => programs.find((x) => String(x._id) === String(p.programId)))
    .filter((p): p is ProgramDoc => Boolean(p));
  return { campaign, institution, programs, chosen };
}

/** DOC-1: active document types that apply to the chosen degree levels. */
export async function requiredDocumentTypes(institutionId: Id, chosen: Pick<ProgramDoc, 'degreeLevel'>[]) {
  const levels = new Set(chosen.map((p) => p.degreeLevel));
  const types = await DocumentTypeModel.find({ institutionId, active: true })
    .sort({ order: 1, name: 1 })
    .lean();
  return types.filter((t) => !t.degreeLevels?.length || t.degreeLevels.some((l) => levels.has(l)));
}

/** FEE-1: highest program fee or sum of program fees, by campaign policy. */
export function applicationFee(
  campaign: Pick<Campaign, 'settings'>,
  chosen: Pick<ProgramDoc, 'applicationFee' | 'title'>[],
) {
  const unique = [...new Map(chosen.map((p) => [p.title, p])).values()];
  if (!unique.length) return { amount: 0, items: [] as { label: string; amount: number }[] };
  if (campaign.settings?.feePolicy === 'SUM') {
    return {
      amount: unique.reduce((s, p) => s + p.applicationFee, 0),
      items: unique.map((p) => ({ label: `Application fee: ${p.title}`, amount: p.applicationFee })),
    };
  }
  const top = unique.reduce((a, b) => (b.applicationFee > a.applicationFee ? b : a));
  return {
    amount: top.applicationFee,
    items: [{ label: 'Application processing fee', amount: top.applicationFee }],
  };
}

/** APP-3: every missing item that blocks submission. */
export async function missingItems(app: AppDoc) {
  const ctx = await contextOf(app);
  const missing: { key: string; message: string }[] = [];
  const profile = await ProfileModel.exists({ userId: app.applicantId });
  if (!profile)
    missing.push({ key: 'profile', message: 'Complete your personal profile (CNIC, address and guardian).' });
  if (!app.preferences.length) missing.push({ key: 'programs', message: 'Choose at least one program.' });
  const records = await currentRecords(app.applicantId);
  for (const p of ctx.chosen) {
    const e = eligibilityFor(p, records);
    for (const c of e.checks.filter((c) => !c.ok))
      missing.push({ key: `eligibility:${p.code}:${c.level}`, message: `${p.title}: ${c.reason}` });
  }
  for (const r of relevantRecords(ctx.chosen, records)) {
    if (r.trustLevel < TRUST.REGISTRY && !r.resultCardFileId) {
      missing.push({
        key: `resultCard:${r.level}`,
        message: `Upload the result card of your ${LEVEL_LABEL[r.level]} record (its marks are not verified automatically).`,
      });
    }
    if (r.verificationStatus === 'MISMATCH')
      missing.push({
        key: `mismatch:${r.level}`,
        message: `Your ${LEVEL_LABEL[r.level]} marks do not match the official result. Correct the record first.`,
      });
  }
  const types = await requiredDocumentTypes(app.institutionId, ctx.chosen);
  const docs = await ApplicantDocumentModel.find({ applicationId: app._id, current: true }).lean();
  for (const t of types.filter((t) => t.required)) {
    const d = docs.find((x) => String(x.documentTypeId) === String(t._id));
    if (!d) missing.push({ key: `document:${t.code}`, message: `Upload your ${t.name}.` });
    else if (d.status === 'REJECTED')
      missing.push({ key: `document:${t.code}`, message: `Replace your ${t.name} (it was rejected).` });
  }
  return { missing, ctx, records };
}

/** FLOW-2: checks the transition table, actor and permission. */
export function findTransition(from: ApplicationStatus, to: ApplicationStatus, actor: Actor) {
  return TRANSITIONS.find((t) => t.to === to && t.actor === actor && t.from.includes(from));
}

export function pushHistory(
  app: AppDoc,
  to: ApplicationStatus,
  actor: Actor,
  by?: { id?: string; name?: string },
  note = '',
) {
  app.history.push({
    from: app.status,
    to,
    actor,
    by: by?.id as never,
    byName: by?.name ?? '',
    note,
    at: new Date(),
  });
  app.status = to;
}

/** APP-4: number, snapshot and challan are created in one transaction. */
export async function submitApplication(req: Request, app: AppDoc) {
  if (app.status !== 'DRAFT') throw ApiError.conflict('This application has already been submitted.');
  const { missing, ctx, records } = await missingItems(app);
  if (missing.length)
    throw new ApiError(422, 'INCOMPLETE_APPLICATION', 'Your application is not complete yet.', { missing });

  const { campaign, institution, chosen } = ctx;
  const now = new Date();
  const open = campaign.status === 'OPEN' && campaign.closesAt > now;
  const lateAllowed = campaign.settings?.latePolicy === 'ALLOW' && app.createdAt! < campaign.closesAt;
  if (!open && !lateAllowed) throw ApiError.conflict('This admission campaign is closed.');

  const plan = await planOf(institution);
  const submittedCount = await ApplicationModel.countDocuments({
    campaignId: campaign._id,
    status: { $ne: 'DRAFT' },
  });
  if (submittedCount >= plan.limits!.applicationsPerCycle) {
    throw new ApiError(
      403,
      'PLAN_LIMIT_REACHED',
      'This institution cannot accept more applications in this campaign. Please contact the institution.',
    );
  }

  const profile = await ProfileModel.findOne({ userId: app.applicantId }).lean();
  const user = await UserModel.findById(app.applicantId).lean();
  const fee = applicationFee(campaign, chosen);
  const campus = await CampusModel.findById(chosen[0]!.campusId).lean();

  const voucher = await withTransaction(async (session: ClientSession) => {
    const seq = await nextSeq(`app:${campaign._id}`, session);
    app.applicationNumber = `${institution.shortName}-${campaign.code}-${campus?.code ?? 'MAIN'}-${pad(seq, 5)}`;
    app.set('snapshot', {
      profile: { ...profile, cnicFormatted: formatCnic(profile!.cnic) },
      records: relevantRecords(chosen, records),
      fee: fee.amount,
    });
    app.submittedAt = now;
    app.late = !open;
    pushHistory(app, 'SUBMITTED', 'APPLICANT', { id: req.auth!.userId, name: req.auth!.name });
    pushHistory(
      app,
      'PAYMENT_PENDING',
      'SYSTEM',
      undefined,
      `Application fee challan issued (Rs. ${fee.amount})`,
    );
    await app.save({ session });
    const vseq = await nextSeq(`voucher:${institution._id}:${now.getFullYear()}`, session);
    const [v] = await VoucherModel.create(
      [
        {
          institutionId: institution._id,
          applicationId: app._id,
          applicantId: app.applicantId,
          voucherNumber: `${institution.shortName}-${now.getFullYear()}-${pad(vseq, 6)}`,
          type: 'APPLICATION',
          items: fee.items,
          amount: fee.amount,
          dueDate: new Date(now.getTime() + 7 * 864e5),
        },
      ],
      { session },
    );
    return v!;
  });

  await audit(
    req,
    'APPLICATION_SUBMITTED',
    'Application',
    app._id,
    { number: app.applicationNumber },
    { institutionId: institution._id },
  );
  await notify(
    app.applicantId,
    {
      type: 'APPLICATION_SUBMITTED',
      title: 'Application submitted',
      body: `${app.applicationNumber} was submitted. Pay the application fee to continue.`,
      link: `/applicant/applications/${app._id}`,
    },
    {
      to: user!.email,
      key: 'APPLICATION_SUBMITTED',
      institutionId: institution._id,
      vars: {
        applicantName: profile!.fullName,
        institutionName: institution.name,
        applicationNumber: app.applicationNumber!,
        campaignName: campaign.title,
        amount: `Rs. ${fee.amount}`,
      },
    },
  );
  return { app, voucher };
}

/** Preconditions of staff transitions (FLOW-3, FLOW-4, FLOW-5). */
export async function checkPreconditions(app: AppDoc, to: ApplicationStatus) {
  const ctx = await contextOf(app);
  const separateEligibility = ctx.institution.settings?.eligibilityAsSeparateStep ?? true;
  if (to === 'DOCUMENT_VERIFICATION' && app.status === 'UNDER_REVIEW') {
    const paid = await VoucherModel.exists({ applicationId: app._id, type: 'APPLICATION', status: 'PAID' });
    if (!paid)
      throw new ApiError(
        409,
        'PRECONDITION_FAILED',
        'Document verification can start only after the fee is verified.',
      );
  }
  if (to === 'ELIGIBILITY_CHECK' || (to === 'VERIFIED' && app.status === 'DOCUMENT_VERIFICATION')) {
    if (to === 'ELIGIBILITY_CHECK' && !separateEligibility)
      throw new ApiError(
        409,
        'PRECONDITION_FAILED',
        'Eligibility is not a separate step in this institution. Mark the application verified.',
      );
    if (to === 'VERIFIED' && separateEligibility)
      throw new ApiError(
        409,
        'PRECONDITION_FAILED',
        'Confirm the documents first; eligibility is reviewed as a separate step.',
      );
    const types = await requiredDocumentTypes(app.institutionId, ctx.chosen);
    const docs = await ApplicantDocumentModel.find({ applicationId: app._id, current: true }).lean();
    const notApproved = types.filter(
      (t) =>
        t.required &&
        !docs.some((d) => String(d.documentTypeId) === String(t._id) && d.status === 'APPROVED'),
    );
    if (notApproved.length) {
      throw new ApiError(
        409,
        'PRECONDITION_FAILED',
        `Every required document must be approved first: ${notApproved.map((t) => t.name).join(', ')}.`,
      );
    }
  }
  if (to === 'VERIFIED') {
    const records = await currentRecords(app.applicantId);
    const min = ctx.campaign.settings?.minTrustLevel ?? TRUST.REGISTRY;
    const weak = relevantRecords(ctx.chosen, records).filter((r) => r.trustLevel < min);
    if (weak.length) {
      throw new ApiError(
        409,
        'PRECONDITION_FAILED',
        `Marks must be verified (trust level ${min} or higher) first: ${weak.map((r) => LEVEL_LABEL[r.level]).join(', ')}.`,
      );
    }
    const notEligible = ctx.chosen.filter((p) => !eligibilityFor(p, records).eligible);
    if (notEligible.length === ctx.chosen.length)
      throw new ApiError(409, 'PRECONDITION_FAILED', 'The applicant is not eligible for any chosen program.');
  }
  return ctx;
}

/** FLOW-2: staff status change with permission, note and precondition checks. */
export async function staffTransition(req: Request, app: AppDoc, to: ApplicationStatus, note: string) {
  const t = findTransition(app.status as ApplicationStatus, to, 'STAFF');
  if (!t)
    throw new ApiError(409, 'INVALID_TRANSITION', `An application cannot move from ${app.status} to ${to}.`);
  if (t.permission && !req.tenant!.permissions.includes(t.permission)) throw ApiError.forbidden();
  if (t.noteRequired && note.trim().length < 5)
    throw ApiError.validation('Please write a note (at least 5 characters).', {
      fields: { note: 'A note is required.' },
    });
  const ctx = await checkPreconditions(app, to);
  pushHistory(app, to, 'STAFF', { id: req.auth!.userId, name: req.auth!.name }, note);
  if (to === 'DEFICIENT') app.set('deficiency', { message: note, at: new Date() });
  await app.save();
  await audit(req, 'APPLICATION_STATUS_CHANGED', 'Application', app._id, { to, note });

  const profile = (app.snapshot?.profile ?? {}) as { fullName?: string };
  const user = await UserModel.findById(app.applicantId).lean();
  const vars = {
    applicantName: profile.fullName,
    institutionName: ctx.institution.name,
    applicationNumber: app.applicationNumber ?? '',
    campaignName: ctx.campaign.title,
    note,
  };
  const link = `/applicant/applications/${app._id}`;
  if (to === 'DEFICIENT') {
    await notify(
      app.applicantId,
      { type: 'DEFICIENCY_NOTICE', title: 'Action needed on your application', body: note, link },
      { to: user!.email, key: 'DEFICIENCY_NOTICE', institutionId: ctx.institution._id, vars },
    );
  } else if (to === 'REJECTED') {
    await notify(
      app.applicantId,
      { type: 'APPLICATION_REJECTED', title: 'Application not accepted', body: note, link },
      { to: user!.email, key: 'APPLICATION_REJECTED', institutionId: ctx.institution._id, vars },
    );
  } else if (to === 'VERIFIED') {
    await notify(
      app.applicantId,
      {
        type: 'APPLICATION_VERIFIED',
        title: 'Application verified',
        body: `${app.applicationNumber} is verified and will be considered in the merit list.`,
        link,
      },
      { to: user!.email, key: 'APPLICATION_VERIFIED', institutionId: ctx.institution._id, vars },
    );
  } else {
    await notify(app.applicantId, {
      type: 'APPLICATION_STATUS',
      title: 'Application update',
      body: `${app.applicationNumber}: ${t.label.toLowerCase()}.`,
      link,
    });
  }
  return app;
}

/** Progress shown on the applicant dashboard (percentage of the admission journey). */
export const PROGRESS: Record<string, number> = {
  DRAFT: 10,
  SUBMITTED: 25,
  PAYMENT_PENDING: 30,
  UNDER_REVIEW: 45,
  DOCUMENT_VERIFICATION: 60,
  DEFICIENT: 55,
  ELIGIBILITY_CHECK: 75,
  VERIFIED: 90,
  REJECTED: 100,
  WITHDRAWN: 100,
};
