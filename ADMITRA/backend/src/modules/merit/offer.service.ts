import type { Request } from 'express';
import type { ClientSession, HydratedDocument } from 'mongoose';
import { audit } from '../../lib/audit';
import { nextSeq, pad } from '../../lib/counter';
import { withTransaction } from '../../lib/db';
import { ApiError } from '../../lib/http';
import { logger } from '../../lib/logger';
import type { Id } from '../../lib/types';
import { ApplicationModel } from '../applications/application.model';
import { pushHistory, type AppDoc } from '../applications/application.service';
import { CampaignModel } from '../campaigns/campaign.model';
import { VoucherModel } from '../fees/fee.models';
import { InstitutionModel } from '../institutions/institution.model';
import { notify } from '../notifications/notify';
import { ProfileModel } from '../profile/profile.model';
import { ProgramModel } from '../programs/program.model';
import { UserModel } from '../users/user.model';
import {
  CnicBlockModel,
  EnrollmentModel,
  OfferModel,
  type AdmissionOffer,
  type Enrollment,
} from './merit.models';

type OfferDoc = HydratedDocument<AdmissionOffer>;
type EnrollmentDoc = HydratedDocument<Enrollment>;

async function mailVars(offer: {
  applicantId: unknown;
  institutionId: unknown;
  programId: unknown;
  applicationId: unknown;
}) {
  const [user, inst, program, app] = await Promise.all([
    UserModel.findById(offer.applicantId).select('email fullName').lean(),
    InstitutionModel.findById(offer.institutionId).select('name').lean(),
    ProgramModel.findById(offer.programId).select('title').lean(),
    ApplicationModel.findById(offer.applicationId).select('applicationNumber').lean(),
  ]);
  return {
    email: user?.email ?? '',
    vars: {
      applicantName: user?.fullName ?? '',
      institutionName: inst?.name ?? '',
      programName: program?.title ?? '',
      applicationNumber: app?.applicationNumber ?? '',
    },
  };
}

/** Table 3.14, step 4: accepting an offer issues the admission-fee challan. */
export async function acceptOffer(req: Request, offerId: Id) {
  const result = await withTransaction(async (session) => {
    const offer = await OfferModel.findOne({ _id: offerId, applicantId: req.auth!.userId }).session(session);
    if (!offer) throw ApiError.notFound('Offer');
    if (offer.status !== 'OFFERED') throw ApiError.conflict('This offer can no longer be accepted.');
    if (offer.deadline <= new Date()) throw ApiError.conflict('The deadline of this offer has passed.');
    const [inst, program, app] = await Promise.all([
      InstitutionModel.findById(offer.institutionId).session(session).lean(),
      ProgramModel.findById(offer.programId).session(session).lean(),
      ApplicationModel.findById(offer.applicationId).session(session),
    ]);
    const now = new Date();
    const seq = await nextSeq(`voucher:${inst!._id}:${now.getFullYear()}`, session);
    const [voucher] = await VoucherModel.create(
      [
        {
          institutionId: offer.institutionId,
          applicationId: offer.applicationId,
          applicantId: offer.applicantId,
          voucherNumber: `${inst!.shortName}-${now.getFullYear()}-${pad(seq, 6)}`,
          type: 'ADMISSION',
          items: [{ label: `Admission fee: ${program!.title}`, amount: program!.admissionFee }],
          amount: program!.admissionFee,
          dueDate: offer.deadline,
        },
      ],
      { session },
    );
    offer.status = 'ACCEPTED';
    offer.respondedAt = now;
    offer.set('voucherId', voucher!._id);
    await offer.save({ session });
    app!.history.push({
      from: app!.status,
      to: app!.status,
      actor: 'APPLICANT',
      by: req.auth!.userId as never,
      byName: req.auth!.name,
      note: `Offer accepted; admission fee challan ${voucher!.voucherNumber} issued`,
      at: now,
    });
    await app!.save({ session });
    await audit(req, 'OFFER_ACCEPTED', 'AdmissionOffer', offer._id, undefined, {
      institutionId: offer.institutionId as never,
      session,
    });
    return { offer, voucher: voucher! };
  });
  return result;
}

/** The applicant declines; the seat goes to the next list (OFFER-3). */
export async function declineOffer(req: Request, offerId: Id) {
  return withTransaction(async (session) => {
    const offer = await OfferModel.findOne({ _id: offerId, applicantId: req.auth!.userId }).session(session);
    if (!offer) throw ApiError.notFound('Offer');
    if (!['OFFERED', 'ACCEPTED'].includes(offer.status))
      throw ApiError.conflict('This offer can no longer be declined.');
    if (offer.voucherId) {
      const v = await VoucherModel.findById(offer.voucherId).session(session);
      if (v && ['AWAITING_VERIFICATION', 'PAID'].includes(v.status))
        throw ApiError.conflict(
          'The admission fee has been paid or is being verified. Contact the admission office.',
        );
      if (v) {
        v.status = 'CANCELLED';
        await v.save({ session });
      }
    }
    offer.status = 'DECLINED';
    offer.respondedAt = new Date();
    await offer.save({ session });
    const app = (await ApplicationModel.findById(offer.applicationId).session(session)) as AppDoc;
    pushHistory(
      app,
      'OFFER_DECLINED',
      'APPLICANT',
      { id: req.auth!.userId, name: req.auth!.name },
      'Offer declined',
    );
    await app.save({ session });
    await audit(req, 'OFFER_DECLINED', 'AdmissionOffer', offer._id, undefined, {
      institutionId: offer.institutionId as never,
      session,
    });
    return offer;
  });
}

/**
 * OFFER-3: offers past their deadline expire, unless a payment proof is waiting for verification
 * or the fee is already paid. Runs every minute from the job scheduler.
 */
export async function expireOffers(now = new Date()) {
  const due = await OfferModel.find({ status: { $in: ['OFFERED', 'ACCEPTED'] }, deadline: { $lt: now } });
  let expired = 0;
  for (const offer of due) {
    if (offer.voucherId) {
      const v = await VoucherModel.findById(offer.voucherId).lean();
      if (v && ['AWAITING_VERIFICATION', 'PAID'].includes(v.status)) continue;
    }
    await withTransaction(async (session) => {
      offer.status = 'EXPIRED';
      await offer.save({ session });
      if (offer.voucherId)
        await VoucherModel.updateOne(
          { _id: offer.voucherId, status: 'ISSUED' },
          { status: 'EXPIRED' },
          { session },
        );
      const app = (await ApplicationModel.findById(offer.applicationId).session(session)) as AppDoc | null;
      if (app && app.status === 'OFFER_ISSUED') {
        pushHistory(app, 'OFFER_EXPIRED', 'SYSTEM', undefined, 'Offer deadline passed');
        await app.save({ session });
      }
    });
    expired++;
    const m = await mailVars(offer);
    await notify(
      offer.applicantId as Id,
      {
        type: 'OFFER_EXPIRED',
        title: 'Your admission offer has expired',
        body: m.vars.programName,
        link: '/applicant/results',
      },
      { to: m.email, key: 'OFFER_EXPIRED', institutionId: offer.institutionId as Id, vars: m.vars },
    );
  }
  return expired;
}

/** OFFER-4: CVU-F26-BSCS-001 */
async function registrationNumber(offer: OfferDoc, session: ClientSession) {
  const [inst, campaign, program] = await Promise.all([
    InstitutionModel.findById(offer.institutionId).session(session).lean(),
    CampaignModel.findById(offer.campaignId).session(session).lean(),
    ProgramModel.findById(offer.programId).session(session).lean(),
  ]);
  const seq = await nextSeq(`reg:${offer.campaignId}:${offer.programId}`, session);
  return `${inst!.shortName}-${campaign!.code}-${program!.code}-${pad(seq, 3)}`;
}

async function completeEnrollment(enrollment: EnrollmentDoc, offer: OfferDoc, session: ClientSession) {
  enrollment.registrationNumber = await registrationNumber(offer, session);
  enrollment.status = 'ENROLLED';
  enrollment.enrolledAt = new Date();
  await enrollment.save({ session });
  const app = (await ApplicationModel.findById(offer.applicationId).session(session)) as AppDoc;
  pushHistory(
    app,
    'ENROLLED',
    'SYSTEM',
    undefined,
    `Enrolled, registration number ${enrollment.registrationNumber}`,
  );
  await app.save({ session });
}

/**
 * Table 3.14, step 5: called inside the payment-verification transaction when an admission fee
 * is verified. MARK-12: with the originals check enabled, enrollment waits for the officer.
 */
export async function enrollAfterPayment(voucherId: Id, session: ClientSession) {
  const offer = await OfferModel.findOne({ voucherId }).session(session);
  if (!offer || offer.status !== 'ACCEPTED') return null;
  const inst = await InstitutionModel.findById(offer.institutionId).session(session).lean();
  const needsOriginals = Boolean(inst?.settings?.requireOriginals);
  const [enrollment] = await EnrollmentModel.create(
    [
      {
        institutionId: offer.institutionId,
        campaignId: offer.campaignId,
        offerId: offer._id,
        applicationId: offer.applicationId,
        applicantId: offer.applicantId,
        programId: offer.programId,
        shift: offer.shift,
        status: needsOriginals ? 'PENDING_ORIGINALS' : 'ENROLLED',
      },
    ],
    { session },
  );
  offer.status = 'ENROLLED';
  await offer.save({ session });
  if (!needsOriginals) await completeEnrollment(enrollment!, offer, session);
  return enrollment!;
}

export async function notifyEnrollment(enrollmentId: Id) {
  const e = await EnrollmentModel.findById(enrollmentId).lean();
  if (!e || e.status !== 'ENROLLED') return;
  const m = await mailVars(e);
  await notify(
    e.applicantId as Id,
    {
      type: 'ENROLLED',
      title: 'Enrollment confirmed',
      body: `Registration number ${e.registrationNumber}`,
      link: '/applicant/results',
    },
    {
      to: m.email,
      key: 'ENROLLED',
      institutionId: e.institutionId as Id,
      vars: { ...m.vars, registrationNumber: e.registrationNumber ?? '' },
    },
  );
}

/** MARK-12: the officer confirms the originals on the reporting day. */
export async function verifyOriginals(req: Request, enrollmentId: Id) {
  const id = await withTransaction(async (session) => {
    const e = await EnrollmentModel.findOne({
      _id: enrollmentId,
      institutionId: req.tenant!.institutionId,
    }).session(session);
    if (!e) throw ApiError.notFound('Enrollment');
    if (e.status !== 'PENDING_ORIGINALS')
      throw ApiError.conflict('This enrollment is not waiting for the originals check.');
    e.originalsVerified = true;
    e.set('originalsVerifiedBy', req.auth!.userId);
    e.originalsVerifiedAt = new Date();
    const offer = (await OfferModel.findById(e.offerId).session(session))!;
    await completeEnrollment(e, offer, session);
    await audit(
      req,
      'ORIGINALS_VERIFIED',
      'Enrollment',
      e._id,
      { registrationNumber: e.registrationNumber },
      { session },
    );
    return e._id;
  });
  await notifyEnrollment(id as Id);
  return EnrollmentModel.findById(id).lean();
}

/**
 * MARK-11: if false marks are confirmed after an offer or enrollment, the admission is revoked
 * with a written reason, the seat is released and the CNIC can be blocked for the cycle.
 */
export async function revokeAdmission(req: Request, offerId: Id, reason: string, blockCnic: boolean) {
  const offer = await withTransaction(async (session) => {
    const o = await OfferModel.findOne({ _id: offerId, institutionId: req.tenant!.institutionId }).session(
      session,
    );
    if (!o) throw ApiError.notFound('Offer');
    if (!['OFFERED', 'ACCEPTED', 'ENROLLED'].includes(o.status))
      throw ApiError.conflict('Only an active offer or enrollment can be revoked.');
    o.status = 'REVOKED';
    o.reason = reason;
    await o.save({ session });
    await EnrollmentModel.updateOne(
      { offerId: o._id },
      { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason },
      { session },
    );
    if (o.voucherId)
      await VoucherModel.updateOne(
        { _id: o.voucherId, status: 'ISSUED' },
        { status: 'CANCELLED' },
        { session },
      );
    const app = (await ApplicationModel.findById(o.applicationId).session(session)) as AppDoc;
    pushHistory(app, 'REVOKED', 'STAFF', { id: req.auth!.userId, name: req.auth!.name }, reason);
    await app.save({ session });
    if (blockCnic) {
      const profile = await ProfileModel.findOne({ userId: o.applicantId }).session(session).lean();
      if (profile)
        await CnicBlockModel.updateOne(
          { campaignId: o.campaignId, cnic: profile.cnic },
          { $set: { institutionId: o.institutionId, reason, by: req.auth!.userId } },
          { upsert: true, session },
        );
    }
    await audit(req, 'ADMISSION_REVOKED', 'AdmissionOffer', o._id, { reason, blockCnic }, { session });
    return o;
  });
  const m = await mailVars(offer);
  await notify(
    offer.applicantId as Id,
    { type: 'ADMISSION_REVOKED', title: 'Admission revoked', body: reason, link: '/applicant/results' },
    {
      to: m.email,
      key: 'ADMISSION_REVOKED',
      institutionId: offer.institutionId as Id,
      vars: { ...m.vars, note: reason },
    },
  );
  return offer;
}

/** Payments on an admission challan are refused once the offer is gone. */
export async function assertOfferOpenForPayment(voucherId: Id) {
  const offer = await OfferModel.findOne({ voucherId }).lean();
  if (offer && offer.status !== 'ACCEPTED')
    throw ApiError.conflict('This admission offer is no longer open.');
}

let timer: NodeJS.Timeout | null = null;
/** Background job: offer expiry every minute (src/jobs in Section 2.5). */
export function startOfferExpiryJob() {
  if (timer) return;
  timer = setInterval(() => {
    expireOffers().catch((err) => logger.error({ err }, 'Offer expiry failed'));
  }, 60_000);
  timer.unref();
}
