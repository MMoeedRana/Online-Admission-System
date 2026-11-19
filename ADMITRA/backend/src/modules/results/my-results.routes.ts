import { Router } from 'express';
import { ApiError, ok } from '../../lib/http';
import { waitlistChance } from '../../lib/merit';
import { admissionLetterPdf } from '../../lib/pdf';
import type { Id } from '../../lib/types';
import { idParams, parse } from '../../lib/validate';
import { ApplicationModel } from '../applications/application.model';
import { CampaignModel } from '../campaigns/campaign.model';
import { PaymentModel, VoucherModel } from '../fees/fee.models';
import { InstitutionModel } from '../institutions/institution.model';
import { EnrollmentModel, MeritEntryModel, MeritListModel, OfferModel } from '../merit/merit.models';
import { letterData } from '../merit/offer.routes';
import { acceptOffer, declineOffer } from '../merit/offer.service';
import { ProgramModel } from '../programs/program.model';
import { advise, savedMarks } from '../directory/advisor.service';

/** FIND-1 to FIND-4 and FIND-8: "Where is my name?" for the signed-in applicant. */
export const myResultsRouter = Router();

/** Share of decided offers that were declined or expired (FIND-3); 10% until there is enough data. */
async function declineRate(campaignId: unknown) {
  const decided = await OfferModel.aggregate([
    { $match: { campaignId, status: { $in: ['ACCEPTED', 'ENROLLED', 'DECLINED', 'EXPIRED'] } } },
    { $group: { _id: { $in: ['$status', ['DECLINED', 'EXPIRED']] }, n: { $sum: 1 } } },
  ]);
  const lost = decided.find((d) => d._id === true)?.n ?? 0;
  const total = decided.reduce((s, d) => s + d.n, 0);
  return total >= 10 ? Math.max(0.05, lost / total) : 0.1;
}

myResultsRouter.get('/results', async (req, res) => {
  const apps = await ApplicationModel.find({ applicantId: req.auth!.userId, status: { $ne: 'DRAFT' } })
    .sort({ submittedAt: -1 })
    .lean();
  const out = [];
  for (const app of apps) {
    const [inst, campaign] = await Promise.all([
      InstitutionModel.findById(app.institutionId).select('name shortName city').lean(),
      CampaignModel.findById(app.campaignId).select('title code').lean(),
    ]);
    const programs = await ProgramModel.find({ _id: { $in: app.preferences.map((p) => p.programId) } })
      .select('title code admissionFee')
      .lean();
    const title = (id: unknown) => programs.find((p) => String(p._id) === String(id))?.title ?? '';
    const lists = await MeritListModel.find({ campaignId: app.campaignId, status: 'PUBLISHED' })
      .sort({ listNumber: -1 })
      .lean();
    let latest = null;
    for (const list of lists) {
      const entry = await MeritEntryModel.findOne({ meritListId: list._id, applicationId: app._id }).lean();
      const excluded = list.excluded.find((x) => String(x.applicationId) === String(app._id));
      if (!entry && !excluded) continue;
      if (!entry) {
        latest = {
          list: {
            _id: list._id,
            listNumber: list.listNumber,
            revision: list.revision,
            publishedAt: list.publishedAt,
          },
          entry: null,
          excludedReason: excluded!.reason,
        };
        break;
      }
      const pool = list.pools.find(
        (p) => String(p.programId) === String(entry.programId) && p.shift === entry.shift,
      );
      const rate = entry.outcome === 'WAITLISTED' ? await declineRate(app.campaignId) : 0.1;
      latest = {
        list: {
          _id: list._id,
          listNumber: list.listNumber,
          revision: list.revision,
          publishedAt: list.publishedAt,
        },
        entry: {
          outcome: entry.outcome,
          program: title(entry.programId),
          programId: entry.programId,
          shift: entry.shift,
          preferenceOrder: entry.preferenceOrder,
          meritPosition: entry.meritPosition,
          waitingPosition: entry.waitingPosition,
          aggregate: entry.aggregate,
          breakdown: entry.breakdown,
        },
        pool: pool
          ? {
              seats: pool.capacity,
              closingAggregate: pool.closingAggregate,
              openingAggregate: pool.openingAggregate,
            }
          : null,
        gap:
          pool?.closingAggregate != null
            ? Math.round((entry.aggregate - pool.closingAggregate) * 100) / 100
            : null,
        waitlist:
          entry.outcome === 'WAITLISTED' && entry.waitingPosition
            ? { ...waitlistChance(entry.waitingPosition, pool?.capacity ?? 0, rate), declineRate: rate }
            : null,
        excludedReason: null,
      };
      break;
    }
    const offer = await OfferModel.findOne({ applicationId: app._id }).sort({ createdAt: -1 }).lean();
    const voucher = offer?.voucherId ? await VoucherModel.findById(offer.voucherId).lean() : null;
    const payment = voucher
      ? await PaymentModel.findOne({ voucherId: voucher._id }).sort({ createdAt: -1 }).lean()
      : null;
    const enrollment = offer ? await EnrollmentModel.findOne({ offerId: offer._id }).lean() : null;
    // FIND-1: the outcome of the latest published list, or Pending.
    const result = [
      'ENROLLED',
      'REVOKED',
      'OFFER_DECLINED',
      'OFFER_EXPIRED',
      'WITHDRAWN',
      'REJECTED',
    ].includes(app.status)
      ? app.status
      : (latest?.entry?.outcome ?? (latest?.excludedReason ? 'EXCLUDED' : 'PENDING'));
    out.push({
      application: { _id: app._id, applicationNumber: app.applicationNumber, status: app.status },
      institution: inst,
      campaign,
      preferences: [...app.preferences]
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ program: title(p.programId), shift: p.shift, order: p.order })),
      result,
      latest,
      offer: offer
        ? {
            _id: offer._id,
            status: offer.status,
            deadline: offer.deadline,
            program: title(offer.programId),
            shift: offer.shift,
            meritPosition: offer.meritPosition,
            aggregate: offer.aggregate,
            admissionFee: programs.find((p) => String(p._id) === String(offer.programId))?.admissionFee ?? 0,
            reason: offer.reason,
          }
        : null,
      voucher: voucher
        ? {
            _id: voucher._id,
            voucherNumber: voucher.voucherNumber,
            amount: voucher.amount,
            status: voucher.status,
            dueDate: voucher.dueDate,
          }
        : null,
      payment: payment
        ? {
            status: payment.status,
            reference: payment.reference,
            receiptNumber: payment.receiptNumber,
            _id: payment._id,
          }
        : null,
      enrollment: enrollment
        ? {
            _id: enrollment._id,
            status: enrollment.status,
            registrationNumber: enrollment.registrationNumber,
            enrolledAt: enrollment.enrolledAt,
          }
        : null,
    });
  }
  // FIND-4: other programs suggested by the Admission Advisor when a list did not select the applicant.
  let suggestions: Awaited<ReturnType<typeof advise>> = [];
  if (out.some((o) => ['NOT_SELECTED', 'WAITLISTED', 'OFFER_EXPIRED'].includes(o.result))) {
    const marks = await savedMarks(req.auth!.userId);
    if (marks.matric != null && marks.inter != null) {
      const all = await advise({
        matric: marks.matric,
        inter: marks.inter,
        test: marks.test,
        fieldGroup: marks.fieldGroup,
        degreeLevel: 'BS',
      });
      suggestions = all.filter((r) => r.band === 'SAFE' || r.band === 'TARGET').slice(0, 4);
    }
  }
  ok(res, out, { suggestions });
});

myResultsRouter.post('/offers/:id/accept', async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await acceptOffer(req, id));
});

myResultsRouter.post('/offers/:id/decline', async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await declineOffer(req, id));
});

myResultsRouter.get('/enrollments/:id/letter.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (!(await EnrollmentModel.exists({ _id: id, applicantId: req.auth!.userId })))
    throw ApiError.notFound('Admission letter');
  admissionLetterPdf(res, await letterData(id as Id));
});
