import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { ApiError, created, ok } from '../../lib/http';
import { meritListPdf, type MeritListPdfData } from '../../lib/pdf';
import type { Id } from '../../lib/types';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicationModel } from '../applications/application.model';
import { CampaignModel } from '../campaigns/campaign.model';
import { InstitutionModel } from '../institutions/institution.model';
import { MeritEntryModel, MeritFormulaModel, MeritListModel, OfferModel } from './merit.models';
import { approveList, discardList, generateList, publishList, reviseList } from './merit.service';

export const meritListRouter = Router();
meritListRouter.use(requirePermission(PERMISSIONS.MERIT_MANAGE, PERMISSIONS.MERIT_PUBLISH));

const deadline = z.object({
  offerDeadline: z.coerce.date({ message: 'Choose the offer deadline.' }),
});

meritListRouter.get('/', async (req, res) => {
  const { campaignId } = parse(z.object({ campaignId: objectId }), req.query);
  const campaign = await CampaignModel.findOne({
    _id: campaignId,
    institutionId: req.tenant!.institutionId,
  }).lean();
  if (!campaign) throw ApiError.notFound('Campaign');
  const [lists, formulas, statusCounts] = await Promise.all([
    MeritListModel.find({ campaignId }).sort({ listNumber: -1, revision: -1 }).lean(),
    MeritFormulaModel.find({ campaignId, status: 'ACTIVE' }).select('programId version').lean(),
    ApplicationModel.aggregate([
      { $match: { campaignId: campaign._id, status: { $ne: 'DRAFT' } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  ok(res, lists, {
    campaign: {
      _id: campaign._id,
      title: campaign.title,
      code: campaign.code,
      status: campaign.status,
      minTrustLevel: campaign.settings?.minTrustLevel ?? 2,
    },
    programsWithoutFormula: campaign.programs.length - formulas.length,
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.n])),
  });
});

meritListRouter.post('/', requirePermission(PERMISSIONS.MERIT_MANAGE), async (req, res) => {
  const b = parse(deadline.extend({ campaignId: objectId }), req.body);
  const campaign = await CampaignModel.exists({
    _id: b.campaignId,
    institutionId: req.tenant!.institutionId,
  });
  if (!campaign) throw ApiError.notFound('Campaign');
  created(res, await generateList(req, b.campaignId, b.offerDeadline));
});

meritListRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const list = await MeritListModel.findOne({ _id: id, institutionId: req.tenant!.institutionId }).lean();
  if (!list) throw ApiError.notFound('Merit list');
  const [entries, offers] = await Promise.all([
    MeritEntryModel.find({ meritListId: list._id }).sort({ programId: 1, shift: 1, meritPosition: 1 }).lean(),
    OfferModel.find({ meritListId: list._id }).select('entryId status').lean(),
  ]);
  const t = req.tenant!;
  ok(res, {
    list,
    entries: entries.map((e) => ({
      ...e,
      offerStatus: offers.find((o) => String(o.entryId) === String(e._id))?.status ?? null,
    })),
    can: {
      approve:
        list.status === 'DRAFT' &&
        String(list.generatedBy) !== req.auth!.userId &&
        (t.permissions.includes(PERMISSIONS.MERIT_MANAGE) ||
          t.permissions.includes(PERMISSIONS.MERIT_PUBLISH)),
      publish: list.status === 'APPROVED' && t.permissions.includes(PERMISSIONS.MERIT_PUBLISH),
      discard: ['DRAFT', 'APPROVED'].includes(list.status),
      revise:
        list.status === 'PUBLISHED' &&
        t.permissions.includes(PERMISSIONS.MERIT_MANAGE) &&
        !offers.some((o) => ['ACCEPTED', 'ENROLLED'].includes(o.status)),
    },
  });
});

meritListRouter.post('/:id/approve', async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await approveList(req, id));
});

meritListRouter.post('/:id/publish', requirePermission(PERMISSIONS.MERIT_PUBLISH), async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await publishList(req, id));
});

meritListRouter.post('/:id/discard', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason } = parse(
    z.object({ reason: z.string().trim().min(5, 'Write why the list is discarded.').max(300) }),
    req.body,
  );
  ok(res, await discardList(req, id, reason));
});

meritListRouter.post('/:id/revise', requirePermission(PERMISSIONS.MERIT_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(deadline, req.body);
  created(res, await reviseList(req, id, b.offerDeadline));
});

export async function meritListPdfData(listId: Id): Promise<MeritListPdfData> {
  const list = await MeritListModel.findById(listId).lean();
  if (!list) throw ApiError.notFound('Merit list');
  const [entries, inst, campaign] = await Promise.all([
    MeritEntryModel.find({ meritListId: list._id }).sort({ meritPosition: 1 }).lean(),
    InstitutionModel.findById(list.institutionId).select('name').lean(),
    CampaignModel.findById(list.campaignId).select('title').lean(),
  ]);
  return {
    institution: inst?.name ?? '',
    campaign: campaign?.title ?? '',
    listNumber: list.listNumber,
    revision: list.revision,
    publishedAt: list.publishedAt ?? null,
    pools: list.pools.map((p) => ({
      title: p.programTitle ?? '',
      shift: p.shift,
      seats: p.seats ?? 0,
      closing: p.closingAggregate ?? null,
      entries: entries
        .filter((e) => String(e.programId) === String(p.programId) && e.shift === p.shift)
        .map((e) => ({
          position: e.meritPosition,
          name: e.shortName,
          applicationNumber: e.applicationNumber,
          aggregate: e.aggregate,
          outcome: e.outcome,
          waiting: e.waitingPosition,
        })),
    })),
  };
}

meritListRouter.get('/:id/pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (!(await MeritListModel.exists({ _id: id, institutionId: req.tenant!.institutionId })))
    throw ApiError.notFound('Merit list');
  meritListPdf(res, await meritListPdfData(id));
});
