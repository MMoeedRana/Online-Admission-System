import { Router } from 'express';
import { z } from 'zod';
import { checkCaptcha, createCaptcha } from '../../lib/captcha';
import { ApiError, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { meritListPdf } from '../../lib/pdf';
import { idParams, objectId, parse } from '../../lib/validate';
import { publicLimiter, statusLookupLimiter } from '../../middleware/rateLimit';
import { ApplicationModel } from '../applications/application.model';
import { CampaignModel } from '../campaigns/campaign.model';
import { InstitutionModel } from '../institutions/institution.model';
import { MeritEntryModel, MeritListModel } from '../merit/merit.models';
import { meritListPdfData } from '../merit/merit-list.routes';
import { ProfileModel } from '../profile/profile.model';

export const publicResultsRouter = Router();
publicResultsRouter.use(publicLimiter);

publicResultsRouter.get('/merit-lists', async (req, res) => {
  const q = parse(paginationQuery.extend({ institutionId: objectId.optional() }), req.query);
  const filter: Record<string, unknown> = { status: 'PUBLISHED' };
  if (q.institutionId) filter.institutionId = q.institutionId;
  if (q.q) {
    const insts = await InstitutionModel.find({ name: { $regex: escapeRegex(q.q), $options: 'i' } }).distinct(
      '_id',
    );
    filter.institutionId = { $in: insts };
  }
  const [items, total] = await Promise.all([
    MeritListModel.find(filter)
      .sort({ publishedAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .select('institutionId campaignId listNumber revision publishedAt counts pools offerDeadline')
      .lean(),
    MeritListModel.countDocuments(filter),
  ]);
  const [insts, campaigns] = await Promise.all([
    InstitutionModel.find({ _id: { $in: items.map((l) => l.institutionId) } })
      .select('name shortName city slug')
      .lean(),
    CampaignModel.find({ _id: { $in: items.map((l) => l.campaignId) } })
      .select('title code')
      .lean(),
  ]);
  ok(
    res,
    items.map((l) => ({
      _id: l._id,
      listNumber: l.listNumber,
      revision: l.revision,
      publishedAt: l.publishedAt,
      offerDeadline: l.offerDeadline,
      selected: l.counts?.selected ?? 0,
      waitlisted: l.counts?.waitlisted ?? 0,
      programs: [...new Set(l.pools.map((p) => p.programTitle))],
      institution: insts.find((i) => String(i._id) === String(l.institutionId)),
      campaign: campaigns.find((c) => String(c._id) === String(l.campaignId)),
    })),
    pageMeta(q.page, q.limit, total),
  );
});

publicResultsRouter.get('/merit-lists/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const q = parse(
    paginationQuery.extend({
      programId: objectId.optional(),
      shift: z.string().max(20).optional(),
      outcome: z.enum(['SELECTED', 'WAITLISTED', 'NOT_SELECTED']).optional(),
    }),
    req.query,
  );
  const list = await MeritListModel.findOne({ _id: id, status: { $in: ['PUBLISHED', 'SUPERSEDED'] } })
    .select('-excluded -generatedBy -approvedBy -publishedBy')
    .lean();
  if (!list) throw ApiError.notFound('Merit list');
  const filter: Record<string, unknown> = { meritListId: list._id };
  if (q.programId) filter.programId = q.programId;
  if (q.shift) filter.shift = q.shift;
  if (q.outcome) filter.outcome = q.outcome;
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: 'i' };
    filter.$or = [{ applicationNumber: rx }, { shortName: rx }];
  }
  const [entries, total, inst, campaign] = await Promise.all([
    MeritEntryModel.find(filter)
      .sort({ programId: 1, shift: 1, meritPosition: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .select(
        'applicationNumber shortName programId shift aggregate meritPosition outcome waitingPosition breakdown',
      )
      .lean(),
    MeritEntryModel.countDocuments(filter),
    InstitutionModel.findById(list.institutionId).select('name shortName city slug').lean(),
    CampaignModel.findById(list.campaignId).select('title code').lean(),
  ]);
  ok(
    res,
    {
      list: {
        _id: list._id,
        listNumber: list.listNumber,
        revision: list.revision,
        status: list.status,
        publishedAt: list.publishedAt,
        offerDeadline: list.offerDeadline,
        pools: list.pools,
        counts: list.counts,
      },
      institution: inst,
      campaign,
      entries: entries.map((e) => ({
        ...e,
        program: list.pools.find((p) => String(p.programId) === String(e.programId))?.programTitle ?? '',
      })),
    },
    pageMeta(q.page, q.limit, total),
  );
});

publicResultsRouter.get('/merit-lists/:id/pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (!(await MeritListModel.exists({ _id: id, status: { $in: ['PUBLISHED', 'SUPERSEDED'] } })))
    throw ApiError.notFound('Merit list');
  meritListPdf(res, await meritListPdfData(id));
});

publicResultsRouter.get('/status/captcha', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await createCaptcha());
});

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  PAYMENT_PENDING: 'Waiting for fee payment',
  UNDER_REVIEW: 'Under review',
  DOCUMENT_VERIFICATION: 'Documents being verified',
  DEFICIENT: 'Corrections requested',
  ELIGIBILITY_CHECK: 'Eligibility being checked',
  VERIFIED: 'Verified, waiting for the merit list',
  REJECTED: 'Not accepted',
  OFFER_ISSUED: 'Selected: admission offer issued',
  WAITLISTED: 'On the waiting list',
  NOT_SELECTED: 'Not selected in the latest merit list',
  OFFER_DECLINED: 'Offer declined',
  OFFER_EXPIRED: 'Offer expired',
  ENROLLED: 'Enrolled',
  WITHDRAWN: 'Withdrawn',
  REVOKED: 'Admission revoked',
};

publicResultsRouter.post('/status', statusLookupLimiter, async (req, res) => {
  const b = parse(
    z.object({
      applicationNumber: z.string().trim().toUpperCase().min(5, 'Enter the application number.').max(40),
      cnicLast4: z
        .string()
        .trim()
        .regex(/^\d{4}$/, 'Enter the last four digits of the CNIC.'),
      captchaId: z.string().max(40),
      captchaAnswer: z.string().trim().max(6),
    }),
    req.body,
  );
  if (!(await checkCaptcha(b.captchaId, b.captchaAnswer)))
    throw ApiError.validation('The answer to the security question is not correct. Try a new one.', {
      fields: { captchaAnswer: 'Not correct.' },
    });
  const app = await ApplicationModel.findOne({ applicationNumber: b.applicationNumber })
    .select('applicantId status updatedAt')
    .lean();
  const profile = app ? await ProfileModel.findOne({ userId: app.applicantId }).select('cnic').lean() : null;
  if (!app || !profile || !profile.cnic.endsWith(b.cnicLast4))
    throw ApiError.notFound('Application with these details');
  ok(res, { status: app.status, label: STATUS_LABELS[app.status] ?? app.status, updatedAt: app.updatedAt });
});
