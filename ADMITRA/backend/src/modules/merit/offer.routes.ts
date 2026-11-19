import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { ApiError, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { admissionLetterPdf, type LetterData } from '../../lib/pdf';
import type { Id } from '../../lib/types';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicationModel } from '../applications/application.model';
import { CampaignModel } from '../campaigns/campaign.model';
import { VoucherModel } from '../fees/fee.models';
import { InstitutionModel } from '../institutions/institution.model';
import { formatCnic, ProfileModel } from '../profile/profile.model';
import { ProgramModel } from '../programs/program.model';
import { EnrollmentModel, OFFER_STATUSES, OfferModel } from './merit.models';
import { poolCapacities } from './merit.service';
import { revokeAdmission, verifyOriginals } from './offer.service';

/** Offers and enrollment (Section 3.13) for the institution staff. */
export const offerRouter = Router();
offerRouter.use(
  requirePermission(
    PERMISSIONS.APPLICATIONS_REVIEW,
    PERMISSIONS.MERIT_PUBLISH,
    PERMISSIONS.MERIT_MANAGE,
    PERMISSIONS.PAYMENTS_VERIFY,
  ),
);

offerRouter.get('/', async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      campaignId: objectId.optional(),
      programId: objectId.optional(),
      status: z.enum([...OFFER_STATUSES, 'PENDING_ORIGINALS']).optional(),
    }),
    req.query,
  );
  const filter: Record<string, unknown> = { institutionId: req.tenant!.institutionId };
  if (q.campaignId) filter.campaignId = q.campaignId;
  if (q.programId) filter.programId = q.programId;
  if (q.status === 'PENDING_ORIGINALS') {
    filter._id = {
      $in: await EnrollmentModel.find({
        institutionId: req.tenant!.institutionId,
        status: 'PENDING_ORIGINALS',
      }).distinct('offerId'),
    };
  } else if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    const apps = await ApplicationModel.find({
      institutionId: req.tenant!.institutionId,
      $or: [{ applicationNumber: rx }, { 'snapshot.profile.fullName': rx }],
    }).distinct('_id');
    filter.applicationId = { $in: apps };
  }
  const [items, total] = await Promise.all([
    OfferModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    OfferModel.countDocuments(filter),
  ]);
  const [apps, programs, vouchers, enrollments] = await Promise.all([
    ApplicationModel.find({ _id: { $in: items.map((o) => o.applicationId) } })
      .select('applicationNumber snapshot.profile.fullName')
      .lean(),
    ProgramModel.find({ _id: { $in: items.map((o) => o.programId) } })
      .select('title code')
      .lean(),
    VoucherModel.find({ _id: { $in: items.map((o) => o.voucherId).filter(Boolean) } })
      .select('voucherNumber status amount')
      .lean(),
    EnrollmentModel.find({ offerId: { $in: items.map((o) => o._id) } }).lean(),
  ]);
  ok(
    res,
    items.map((o) => {
      const app = apps.find((a) => String(a._id) === String(o.applicationId));
      return {
        ...o,
        applicationNumber: app?.applicationNumber ?? '',
        applicantName: (app?.snapshot?.profile as { fullName?: string } | null)?.fullName ?? '',
        program: programs.find((p) => String(p._id) === String(o.programId)) ?? null,
        voucher: vouchers.find((v) => String(v._id) === String(o.voucherId)) ?? null,
        enrollment: enrollments.find((e) => String(e.offerId) === String(o._id)) ?? null,
      };
    }),
    pageMeta(q.page, q.limit, total),
  );
});

/** Seats, offers, acceptances and enrollments per program and shift. */
offerRouter.get('/summary', async (req, res) => {
  const { campaignId } = parse(z.object({ campaignId: objectId }), req.query);
  const campaign = await CampaignModel.findOne({
    _id: campaignId,
    institutionId: req.tenant!.institutionId,
  }).lean();
  if (!campaign) throw ApiError.notFound('Campaign');
  const programs = await ProgramModel.find({ _id: { $in: campaign.programs.map((p) => p.programId) } })
    .select('title code shifts')
    .lean();
  const counts = await OfferModel.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: { _id: { programId: '$programId', shift: '$shift', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const pending = await EnrollmentModel.countDocuments({
    campaignId: campaign._id,
    status: 'PENDING_ORIGINALS',
  });
  ok(res, {
    pendingOriginals: pending,
    rows: programs.flatMap((p) => {
      // Seats of this campaign: a campaign seat cap reduces the program's seats (as in the merit engine).
      const cap = campaign.programs.find((x) => String(x.programId) === String(p._id))?.seatCap;
      return poolCapacities(p as never, cap).map((s) => {
        const c = (st: string) =>
          counts.find(
            (x) =>
              String(x._id.programId) === String(p._id) && x._id.shift === s.shift && x._id.status === st,
          )?.n ?? 0;
        return {
          programId: p._id,
          title: p.title,
          code: p.code,
          shift: s.shift,
          seats: s.capacity,
          offered: c('OFFERED'),
          accepted: c('ACCEPTED'),
          enrolled: c('ENROLLED'),
          declined: c('DECLINED'),
          expired: c('EXPIRED'),
          revoked: c('REVOKED'),
        };
      });
    }),
  });
});

/** MARK-11: revocation with a written reason and an optional CNIC block. */
offerRouter.post('/:id/revoke', requirePermission(PERMISSIONS.MERIT_PUBLISH), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(
    z.object({
      reason: z.string().trim().min(10, 'Write the reason (at least 10 characters).').max(500),
      blockCnic: z.boolean().default(false),
    }),
    req.body,
  );
  ok(res, await revokeAdmission(req, id, b.reason, b.blockCnic));
});

/** MARK-12: originals checked on the reporting day. */
offerRouter.post(
  '/enrollments/:id/originals',
  requirePermission(PERMISSIONS.APPLICATIONS_REVIEW),
  async (req, res) => {
    const { id } = parse(idParams, req.params);
    ok(res, await verifyOriginals(req, id));
  },
);

export async function letterData(enrollmentId: Id): Promise<LetterData> {
  const e = await EnrollmentModel.findById(enrollmentId).lean();
  if (!e || e.status !== 'ENROLLED' || !e.registrationNumber) throw ApiError.notFound('Admission letter');
  const [inst, app, program, campaign, offer, profile] = await Promise.all([
    InstitutionModel.findById(e.institutionId).lean(),
    ApplicationModel.findById(e.applicationId).lean(),
    ProgramModel.findById(e.programId).lean(),
    CampaignModel.findById(e.campaignId).lean(),
    OfferModel.findById(e.offerId).lean(),
    ProfileModel.findOne({ userId: e.applicantId }).lean(),
  ]);
  return {
    institution: { name: inst!.name, city: inst!.city, address: inst!.address ?? '' },
    registrationNumber: e.registrationNumber,
    applicationNumber: app?.applicationNumber ?? '',
    applicant: {
      name: profile?.fullName ?? '',
      fatherName: profile?.fatherName ?? '',
      cnic: profile ? formatCnic(profile.cnic) : '',
    },
    program: program?.title ?? '',
    shift: e.shift,
    campaign: campaign?.title ?? '',
    meritPosition: offer?.meritPosition ?? 0,
    aggregate: offer?.aggregate ?? 0,
    enrolledAt: e.enrolledAt ?? new Date(),
  };
}

offerRouter.get('/enrollments/:id/letter.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (!(await EnrollmentModel.exists({ _id: id, institutionId: req.tenant!.institutionId })))
    throw ApiError.notFound('Admission letter');
  admissionLetterPdf(res, await letterData(id));
});
