import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  DUPLICATE_POLICIES,
  FEE_POLICIES,
  LATE_POLICIES,
} from '../../constants/enums';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ProgramModel } from '../programs/program.model';
import { AcademicSessionModel } from '../structure/structure.models';
import { CampaignModel } from './campaign.model';

export const campaignRouter = Router();
const tid = (req: Request) => req.tenant!.institutionId;

const campaignBody = z
  .object({
    title: z.string().trim().min(3).max(100),
    code: z
      .string()
      .trim()
      .min(2)
      .max(15)
      .regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and -'),
    sessionId: objectId,
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    programs: z
      .array(
        z.object({ programId: objectId, seatCap: z.coerce.number().int().min(1).nullable().default(null) }),
      )
      .min(1, 'Add at least one program.')
      .refine(
        (p) => new Set(p.map((x) => x.programId)).size === p.length,
        'A program can be added only once.',
      ),
    settings: z.object({
      maxPreferences: z.coerce.number().int().min(1).max(10).default(3),
      duplicatePolicy: z.enum(DUPLICATE_POLICIES).default('ONE_ACTIVE'),
      latePolicy: z.enum(LATE_POLICIES).default('REFUSE'),
      feePolicy: z.enum(FEE_POLICIES).default('HIGHEST'),
      minTrustLevel: z.coerce.number().int().min(0).max(3).default(2),
    }),
  })
  .refine((v) => v.closesAt > v.opensAt, {
    message: 'Closing time must be after the opening time.',
    path: ['closesAt'],
  });

async function checkRefs(req: Request, body: z.infer<typeof campaignBody>) {
  if (!(await AcademicSessionModel.exists({ _id: body.sessionId, institutionId: tid(req) }))) {
    throw ApiError.validation('Unknown session.', { fields: { sessionId: 'Unknown session.' } });
  }
  const ids = body.programs.map((p) => p.programId);
  const progs = await ProgramModel.find({
    _id: { $in: ids },
    institutionId: tid(req),
    status: 'ACTIVE',
  }).lean();
  if (progs.length !== ids.length) {
    throw ApiError.validation('Only active programs of this institution can be added.', {
      fields: { programs: 'Invalid program.' },
    });
  }
  for (const p of body.programs) {
    const prog = progs.find((x) => String(x._id) === p.programId)!;
    const seats = prog.shifts.reduce((s, x) => s + x.seats, 0);
    if (p.seatCap && p.seatCap > seats) {
      throw ApiError.validation(`Seat cap of ${prog.title} cannot exceed its ${seats} seats.`, {
        fields: { programs: 'Seat cap too high.' },
      });
    }
  }
}

campaignRouter.get('/', requirePermission(PERMISSIONS.STRUCTURE_VIEW), async (req, res) => {
  const q = parse(z.object({ status: z.enum(CAMPAIGN_STATUSES).optional() }), req.query);
  const filter: Record<string, unknown> = { institutionId: tid(req) };
  if (q.status) filter.status = q.status;
  const items = await CampaignModel.find(filter).sort({ opensAt: -1 }).populate('sessionId', 'name').lean();
  ok(res, items);
});

campaignRouter.get('/:id', requirePermission(PERMISSIONS.STRUCTURE_VIEW), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const c = await CampaignModel.findOne({ _id: id, institutionId: tid(req) })
    .populate('sessionId', 'name')
    .populate('programs.programId', 'title code degreeLevel shifts applicationFee status')
    .lean();
  if (!c) throw ApiError.notFound('Campaign');
  ok(res, c);
});

campaignRouter.post('/', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), async (req, res) => {
  const body = parse(campaignBody, req.body);
  await checkRefs(req, body);
  if (await CampaignModel.exists({ institutionId: tid(req), code: body.code.toUpperCase() })) {
    throw ApiError.conflict('Campaign code already used.', { fields: { code: 'Code already used.' } });
  }
  const c = await CampaignModel.create({ ...body, institutionId: tid(req), status: 'DRAFT' });
  await audit(req, 'CAMPAIGN_CREATED', 'AdmissionCampaign', c._id, { title: c.title, code: c.code });
  created(res, c);
});

campaignRouter.patch('/:id', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(campaignBody, req.body);
  const c = await CampaignModel.findOne({ _id: id, institutionId: tid(req) });
  if (!c) throw ApiError.notFound('Campaign');
  if (c.status === 'ARCHIVED') throw ApiError.conflict('Archived campaigns cannot be changed.');
  await checkRefs(req, body);
  if (
    await CampaignModel.exists({ institutionId: tid(req), code: body.code.toUpperCase(), _id: { $ne: id } })
  ) {
    throw ApiError.conflict('Campaign code already used.', { fields: { code: 'Code already used.' } });
  }
  if (c.status === 'OPEN' && body.closesAt <= new Date()) {
    throw ApiError.validation('An open campaign must close in the future.', {
      fields: { closesAt: 'Must be in the future.' },
    });
  }
  c.set(body);
  await c.save();
  await audit(req, 'CAMPAIGN_UPDATED', 'AdmissionCampaign', id, { title: c.title });
  ok(res, c);
});

campaignRouter.post('/:id/status', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { to } = parse(z.object({ to: z.enum(CAMPAIGN_STATUSES) }), req.body);
  const c = await CampaignModel.findOne({ _id: id, institutionId: tid(req) });
  if (!c) throw ApiError.notFound('Campaign');
  if (!CAMPAIGN_TRANSITIONS[c.status].includes(to)) {
    throw new ApiError(409, 'INVALID_TRANSITION', `A campaign cannot move from ${c.status} to ${to}.`);
  }
  if (to === 'OPEN') {
    if (c.closesAt <= new Date()) {
      throw ApiError.validation('The closing time has passed. Change the closing time before opening.', {
        fields: { closesAt: 'Must be in the future.' },
      });
    }
    const active = await ProgramModel.countDocuments({
      _id: { $in: c.programs.map((p) => p.programId) },
      status: 'ACTIVE',
    });
    if (active !== c.programs.length)
      throw ApiError.conflict('Remove archived programs before opening the campaign.');
  }
  c.history.push({ from: c.status, to, by: req.auth!.userId as never, at: new Date() });
  c.status = to;
  await c.save();
  await audit(req, 'CAMPAIGN_STATUS_CHANGED', 'AdmissionCampaign', id, { to });
  ok(res, c);
});

campaignRouter.delete('/:id', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const c = await CampaignModel.findOne({ _id: id, institutionId: tid(req) });
  if (!c) throw ApiError.notFound('Campaign');
  if (c.status !== 'DRAFT') throw ApiError.conflict('Only draft campaigns can be deleted.');
  await c.deleteOne();
  await audit(req, 'CAMPAIGN_DELETED', 'AdmissionCampaign', id);
  ok(res, { deleted: true });
});
