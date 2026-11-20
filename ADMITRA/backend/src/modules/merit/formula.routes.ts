import { Router, type Request } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import {
  COMPONENT_LABELS,
  MERIT_COMPONENTS,
  TIE_BREAKERS,
  computeAggregate,
  validateComponents,
  type FormulaComponent,
} from '../../lib/merit';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { CampaignModel } from '../campaigns/campaign.model';
import { ProgramModel } from '../programs/program.model';
import { MeritFormulaModel } from './merit.models';

export const formulaRouter = Router();
formulaRouter.use(requirePermission(PERMISSIONS.MERIT_MANAGE, PERMISSIONS.MERIT_PUBLISH));
const manage = requirePermission(PERMISSIONS.MERIT_MANAGE);

const component = z.object({
  type: z.enum(MERIT_COMPONENTS),
  testName: z.string().trim().max(60).default(''),
  weight: z.coerce.number().positive('Weight must be greater than zero.').max(100),
  minPercentage: z.coerce.number().min(0).max(100).nullable().default(null),
  required: z.boolean().default(true),
});
const body = z.object({
  components: z.array(component).min(1).max(6),
  tieBreakers: z.array(z.enum(TIE_BREAKERS)).max(5).default(['ENTRY_TEST', 'INTERMEDIATE', 'YOUNGER']),
  note: z.string().trim().max(300).default(''),
});

function checkWeights(components: FormulaComponent[]) {
  const err = validateComponents(components);
  if (err) throw ApiError.validation(err, { fields: { components: err } });
}

formulaRouter.get('/', async (req, res) => {
  const q = parse(z.object({ campaignId: objectId }), req.query);
  const campaign = await CampaignModel.findOne({
    _id: q.campaignId,
    institutionId: req.tenant!.institutionId,
  }).lean();
  if (!campaign) throw ApiError.notFound('Campaign');
  const [programs, formulas] = await Promise.all([
    ProgramModel.find({ _id: { $in: campaign.programs.map((p) => p.programId) } })
      .select('title code degreeLevel testRequired testName eligibility')
      .lean(),
    MeritFormulaModel.find({ campaignId: campaign._id }).sort({ version: -1 }).lean(),
  ]);
  ok(
    res,
    programs.map((p) => {
      const versions = formulas.filter((f) => String(f.programId) === String(p._id));
      return {
        program: p,
        active: versions.find((v) => v.status === 'ACTIVE') ?? null,
        versions,
      };
    }),
    { components: COMPONENT_LABELS, tieBreakers: TIE_BREAKERS },
  );
});

formulaRouter.post('/', manage, async (req, res) => {
  const b = parse(body.extend({ campaignId: objectId, programId: objectId }), req.body);
  checkWeights(b.components);
  const campaign = await CampaignModel.findOne({
    _id: b.campaignId,
    institutionId: req.tenant!.institutionId,
  }).lean();
  if (!campaign || !campaign.programs.some((p) => String(p.programId) === b.programId))
    throw ApiError.notFound('Program in this campaign');
  if (await MeritFormulaModel.exists({ campaignId: b.campaignId, programId: b.programId, status: 'DRAFT' }))
    throw ApiError.conflict('A draft formula already exists for this program. Edit it instead.');
  const last = await MeritFormulaModel.findOne({ campaignId: b.campaignId, programId: b.programId })
    .sort({ version: -1 })
    .lean();
  const f = await MeritFormulaModel.create({
    ...b,
    institutionId: req.tenant!.institutionId,
    version: (last?.version ?? 0) + 1,
    createdBy: req.auth!.userId,
    createdByName: req.auth!.name,
  });
  await audit(req, 'FORMULA_CREATED', 'MeritFormula', f._id, { version: f.version });
  created(res, f);
});

async function own(req: Request, id: string) {
  const f = await MeritFormulaModel.findOne({ _id: id, institutionId: req.tenant!.institutionId });
  if (!f) throw ApiError.notFound('Formula');
  return f;
}

formulaRouter.patch('/:id', manage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const b = parse(body, req.body);
  checkWeights(b.components);
  const f = await own(req, id);
  if (f.status !== 'DRAFT')
    throw ApiError.conflict(
      'Active and retired versions are locked. Create a new version to change the formula.',
    );
  f.set(b);
  await f.save();
  await audit(req, 'FORMULA_UPDATED', 'MeritFormula', f._id, { version: f.version });
  ok(res, f);
});

formulaRouter.post('/:id/activate', manage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const f = await own(req, id);
  if (f.status !== 'DRAFT') throw ApiError.conflict('Only a draft can be activated.');
  checkWeights(f.components as FormulaComponent[]);
  await MeritFormulaModel.updateMany(
    { campaignId: f.campaignId, programId: f.programId, status: 'ACTIVE' },
    { status: 'RETIRED' },
  );
  f.status = 'ACTIVE';
  f.set('activatedBy', req.auth!.userId);
  f.activatedAt = new Date();
  await f.save();
  await audit(req, 'FORMULA_ACTIVATED', 'MeritFormula', f._id, { version: f.version });
  ok(res, f);
});

formulaRouter.post('/:id/new-version', manage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const f = await own(req, id);
  if (await MeritFormulaModel.exists({ campaignId: f.campaignId, programId: f.programId, status: 'DRAFT' }))
    throw ApiError.conflict('A draft version already exists for this program.');
  const last = await MeritFormulaModel.findOne({ campaignId: f.campaignId, programId: f.programId })
    .sort({ version: -1 })
    .lean();
  const n = await MeritFormulaModel.create({
    institutionId: f.institutionId,
    campaignId: f.campaignId,
    programId: f.programId,
    version: last!.version + 1,
    components: f.components,
    tieBreakers: f.tieBreakers,
    note: '',
    createdBy: req.auth!.userId,
    createdByName: req.auth!.name,
  });
  await audit(req, 'FORMULA_VERSION_CREATED', 'MeritFormula', n._id, { from: f.version, version: n.version });
  created(res, n);
});

formulaRouter.delete('/:id', manage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const f = await own(req, id);
  if (f.status !== 'DRAFT') throw ApiError.conflict('Only a draft can be deleted.');
  await f.deleteOne();
  await audit(req, 'FORMULA_DELETED', 'MeritFormula', id);
  ok(res, { deleted: true });
});

formulaRouter.post('/test', async (req, res) => {
  const b = parse(
    z.object({
      components: z.array(component).min(1).max(6),
      marks: z.record(z.string(), z.coerce.number().min(0).max(100)),
    }),
    req.body,
  );
  checkWeights(b.components);
  const records = Object.entries(b.marks).map(([key, percentage]) => {
    const [level, testName] = key.split(':');
    return { level: level!, testName: testName ?? '', percentage, trustLevel: 3 };
  });
  ok(res, computeAggregate(b.components, records));
});
