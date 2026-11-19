import { Router, type Request } from 'express';
import { z } from 'zod';
import { DEGREE_LEVELS, QUALIFICATION_LEVELS, SHIFTS } from '../../constants/enums';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { CampaignModel } from '../campaigns/campaign.model';
import { assertWithinLimit } from '../institutions/limits';
import { CampusModel, DepartmentModel } from '../structure/structure.models';
import { ProgramModel } from './program.model';

export const programRouter = Router();
const tid = (req: Request) => req.tenant!.institutionId;

export const programBody = z
  .object({
    title: z.string().trim().min(3).max(150),
    code: z
      .string()
      .trim()
      .min(2)
      .max(15)
      .regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and -'),
    degreeLevel: z.enum(DEGREE_LEVELS),
    fieldGroup: z.string().trim().max(60).default(''),
    durationYears: z.coerce.number().int().min(1).max(8),
    description: z.string().trim().max(2000).default(''),
    departmentId: objectId,
    campusId: objectId,
    shifts: z
      .array(
        z.object({
          name: z.enum(SHIFTS),
          seats: z.coerce.number().int().min(1, 'Seats must be at least 1.').max(5000),
        }),
      )
      .min(1, 'Add at least one shift with seats.')
      .refine((s) => new Set(s.map((x) => x.name)).size === s.length, 'Each shift can be added only once.'),
    eligibility: z
      .array(
        z.object({
          level: z.enum(QUALIFICATION_LEVELS),
          minPercentage: z.coerce.number().min(0).max(100),
          groups: z.array(z.string().trim().min(1)).default([]),
          subjects: z.array(z.string().trim().min(1)).default([]),
        }),
      )
      .default([]),
    testRequired: z.boolean().default(false),
    testName: z.string().trim().max(80).default(''),
    applicationFee: z.coerce.number().min(0).max(1_000_000),
    admissionFee: z.coerce.number().min(0).max(10_000_000),
  })
  .refine((v) => !v.testRequired || v.testName.length > 0, {
    message: 'Enter the name of the entry test.',
    path: ['testName'],
  });

async function checkRefs(req: Request, body: { departmentId?: string; campusId?: string }) {
  if (
    body.departmentId &&
    !(await DepartmentModel.exists({ _id: body.departmentId, institutionId: tid(req) }))
  ) {
    throw ApiError.validation('Unknown department.', { fields: { departmentId: 'Unknown department.' } });
  }
  if (body.campusId && !(await CampusModel.exists({ _id: body.campusId, institutionId: tid(req) }))) {
    throw ApiError.validation('Unknown campus.', { fields: { campusId: 'Unknown campus.' } });
  }
}

programRouter.get('/', requirePermission(PERMISSIONS.STRUCTURE_VIEW), async (req, res) => {
  const q = parse(
    paginationQuery.extend({
      status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
      degreeLevel: z.enum(DEGREE_LEVELS).optional(),
      departmentId: objectId.optional(),
    }),
    req.query,
  );
  const filter: Record<string, unknown> = { institutionId: tid(req) };
  if (q.status) filter.status = q.status;
  if (q.degreeLevel) filter.degreeLevel = q.degreeLevel;
  if (q.departmentId) filter.departmentId = q.departmentId;
  if (q.q)
    filter.$or = [
      { title: { $regex: escapeRegex(q.q), $options: 'i' } },
      { code: { $regex: escapeRegex(q.q), $options: 'i' } },
    ];
  const [items, total] = await Promise.all([
    ProgramModel.find(filter)
      .sort({ status: 1, title: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('departmentId', 'name code')
      .populate('campusId', 'name code')
      .lean(),
    ProgramModel.countDocuments(filter),
  ]);
  ok(res, items, pageMeta(q.page, q.limit, total));
});

programRouter.get('/:id', requirePermission(PERMISSIONS.STRUCTURE_VIEW), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const p = await ProgramModel.findOne({ _id: id, institutionId: tid(req) }).lean();
  if (!p) throw ApiError.notFound('Program');
  ok(res, p);
});

programRouter.post('/', requirePermission(PERMISSIONS.PROGRAMS_MANAGE), async (req, res) => {
  const body = parse(programBody, req.body);
  await checkRefs(req, body);
  await assertWithinLimit(req.tenant!.institution, 'programs');
  if (await ProgramModel.exists({ institutionId: tid(req), code: body.code.toUpperCase() })) {
    throw ApiError.conflict('Program code already used in this institution.', {
      fields: { code: 'Code already used.' },
    });
  }
  const p = await ProgramModel.create({ ...body, institutionId: tid(req) });
  await audit(req, 'PROGRAM_CREATED', 'Program', p._id, { title: p.title, code: p.code });
  created(res, p);
});

programRouter.patch('/:id', requirePermission(PERMISSIONS.PROGRAMS_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(programBody, req.body);
  await checkRefs(req, body);
  if (
    await ProgramModel.exists({ institutionId: tid(req), code: body.code.toUpperCase(), _id: { $ne: id } })
  ) {
    throw ApiError.conflict('Program code already used in this institution.', {
      fields: { code: 'Code already used.' },
    });
  }
  const p = await ProgramModel.findOneAndUpdate({ _id: id, institutionId: tid(req) }, body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!p) throw ApiError.notFound('Program');
  await audit(req, 'PROGRAM_UPDATED', 'Program', id, { title: p.title, code: p.code });
  ok(res, p);
});

/** PROG-4: programs used by other records are archived, not deleted. */
programRouter.post('/:id/status', requirePermission(PERMISSIONS.PROGRAMS_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'ARCHIVED']) }), req.body);
  const p = await ProgramModel.findOne({ _id: id, institutionId: tid(req) });
  if (!p) throw ApiError.notFound('Program');
  if (status === 'ARCHIVED' && (await CampaignModel.exists({ status: 'OPEN', 'programs.programId': id }))) {
    throw ApiError.conflict('This program is part of an open campaign. Close the campaign first.');
  }
  if (status === 'ACTIVE' && p.status === 'ARCHIVED')
    await assertWithinLimit(req.tenant!.institution, 'programs');
  p.status = status;
  await p.save();
  await audit(req, status === 'ARCHIVED' ? 'PROGRAM_ARCHIVED' : 'PROGRAM_RESTORED', 'Program', id);
  ok(res, p);
});

programRouter.delete('/:id', requirePermission(PERMISSIONS.PROGRAMS_MANAGE), async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (await CampaignModel.exists({ 'programs.programId': id })) {
    throw ApiError.conflict(
      'This program is used in an admission campaign and cannot be deleted. Archive it instead.',
    );
  }
  const r = await ProgramModel.deleteOne({ _id: id, institutionId: tid(req) });
  if (!r.deletedCount) throw ApiError.notFound('Program');
  await audit(req, 'PROGRAM_DELETED', 'Program', id);
  ok(res, { deleted: true });
});
