import { Router, type Request } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { CampaignModel } from '../campaigns/campaign.model';
import { assertWithinLimit } from '../institutions/limits';
import { ProgramModel } from '../programs/program.model';
import { MemberModel } from '../staff/member.model';
import { AcademicSessionModel, CampusModel, DepartmentModel, FacultyModel } from './structure.models';

export const structureRouter = Router();
const canView = requirePermission(PERMISSIONS.STRUCTURE_VIEW);
const canManage = requirePermission(PERMISSIONS.STRUCTURE_MANAGE);
const tid = (req: Request) => req.tenant!.institutionId;
const code = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and -');
const inUse = (what: string) => ApiError.conflict(`This record is used by ${what} and cannot be deleted.`);

/** Overview used by forms (selects) and the academic structure screen. */
structureRouter.get('/', canView, async (req, res) => {
  const institutionId = tid(req);
  const [campuses, faculties, departments, sessions] = await Promise.all([
    CampusModel.find({ institutionId }).sort({ isMain: -1, name: 1 }).lean(),
    FacultyModel.find({ institutionId }).sort({ name: 1 }).lean(),
    DepartmentModel.find({ institutionId }).sort({ name: 1 }).lean(),
    AcademicSessionModel.find({ institutionId }).sort({ startDate: -1 }).lean(),
  ]);
  ok(res, { campuses, faculties, departments, sessions });
});

// ---------------- Campuses ----------------
const campusBody = z.object({
  name: z.string().trim().min(2).max(120),
  code,
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().max(300).default(''),
  isMain: z.boolean().default(false),
});

structureRouter.post('/campuses', canManage, async (req, res) => {
  const body = parse(campusBody, req.body);
  await assertWithinLimit(req.tenant!.institution, 'campuses');
  const first = !(await CampusModel.exists({ institutionId: tid(req) }));
  if (body.isMain || first) await CampusModel.updateMany({ institutionId: tid(req) }, { isMain: false });
  const campus = await CampusModel.create({ ...body, isMain: body.isMain || first, institutionId: tid(req) });
  await audit(req, 'CAMPUS_CREATED', 'Campus', campus._id, body);
  created(res, campus);
});

structureRouter.patch('/campuses/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(campusBody.partial(), req.body);
  const campus = await CampusModel.findOne({ _id: id, institutionId: tid(req) });
  if (!campus) throw ApiError.notFound('Campus');
  if (body.isMain === false && campus.isMain) throw ApiError.conflict('Mark another campus as main instead.');
  if (body.isMain)
    await CampusModel.updateMany({ institutionId: tid(req), _id: { $ne: id } }, { isMain: false });
  campus.set(body);
  await campus.save();
  await audit(req, 'CAMPUS_UPDATED', 'Campus', id, body);
  ok(res, campus);
});

structureRouter.delete('/campuses/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const campus = await CampusModel.findOne({ _id: id, institutionId: tid(req) });
  if (!campus) throw ApiError.notFound('Campus');
  if (await ProgramModel.exists({ campusId: id })) throw inUse('programs');
  if (await DepartmentModel.exists({ campusIds: id })) throw inUse('departments');
  if (campus.isMain && (await CampusModel.countDocuments({ institutionId: tid(req) })) > 1) {
    throw ApiError.conflict('Mark another campus as main before deleting the main campus.');
  }
  await campus.deleteOne();
  await audit(req, 'CAMPUS_DELETED', 'Campus', id);
  ok(res, { deleted: true });
});

// ---------------- Faculties ----------------
const facultyBody = z.object({ name: z.string().trim().min(2).max(120), code });

structureRouter.post('/faculties', canManage, async (req, res) => {
  const body = parse(facultyBody, req.body);
  const faculty = await FacultyModel.create({ ...body, institutionId: tid(req) });
  await audit(req, 'FACULTY_CREATED', 'Faculty', faculty._id, body);
  created(res, faculty);
});

structureRouter.patch('/faculties/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(facultyBody.partial(), req.body);
  const faculty = await FacultyModel.findOneAndUpdate({ _id: id, institutionId: tid(req) }, body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!faculty) throw ApiError.notFound('Faculty');
  await audit(req, 'FACULTY_UPDATED', 'Faculty', id, body);
  ok(res, faculty);
});

structureRouter.delete('/faculties/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (await DepartmentModel.exists({ facultyId: id })) throw inUse('departments');
  const r = await FacultyModel.deleteOne({ _id: id, institutionId: tid(req) });
  if (!r.deletedCount) throw ApiError.notFound('Faculty');
  await audit(req, 'FACULTY_DELETED', 'Faculty', id);
  ok(res, { deleted: true });
});

// ---------------- Departments ----------------
const departmentBody = z.object({
  name: z.string().trim().min(2).max(120),
  code,
  facultyId: objectId,
  campusIds: z.array(objectId).min(1, 'Select at least one campus.'),
});

async function checkDepartmentRefs(req: Request, body: { facultyId?: string; campusIds?: string[] }) {
  if (body.facultyId && !(await FacultyModel.exists({ _id: body.facultyId, institutionId: tid(req) }))) {
    throw ApiError.validation('Unknown faculty.', { fields: { facultyId: 'Unknown faculty.' } });
  }
  if (body.campusIds) {
    const n = await CampusModel.countDocuments({ _id: { $in: body.campusIds }, institutionId: tid(req) });
    if (n !== body.campusIds.length)
      throw ApiError.validation('Unknown campus.', { fields: { campusIds: 'Unknown campus.' } });
  }
}

structureRouter.post('/departments', canManage, async (req, res) => {
  const body = parse(departmentBody, req.body);
  await checkDepartmentRefs(req, body);
  const dep = await DepartmentModel.create({ ...body, institutionId: tid(req) });
  await audit(req, 'DEPARTMENT_CREATED', 'Department', dep._id, body);
  created(res, dep);
});

structureRouter.patch('/departments/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(departmentBody.partial(), req.body);
  await checkDepartmentRefs(req, body);
  const dep = await DepartmentModel.findOneAndUpdate({ _id: id, institutionId: tid(req) }, body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!dep) throw ApiError.notFound('Department');
  await audit(req, 'DEPARTMENT_UPDATED', 'Department', id, body);
  ok(res, dep);
});

structureRouter.delete('/departments/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (await ProgramModel.exists({ departmentId: id })) throw inUse('programs');
  if (await MemberModel.exists({ departmentIds: id })) throw inUse('staff members');
  const r = await DepartmentModel.deleteOne({ _id: id, institutionId: tid(req) });
  if (!r.deletedCount) throw ApiError.notFound('Department');
  await audit(req, 'DEPARTMENT_DELETED', 'Department', id);
  ok(res, { deleted: true });
});

// ---------------- Academic sessions ----------------
const sessionBody = z
  .object({
    name: z.string().trim().min(4).max(30),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'End date must be after the start date.',
    path: ['endDate'],
  });

structureRouter.post('/sessions', canManage, async (req, res) => {
  const body = parse(sessionBody, req.body);
  const first = !(await AcademicSessionModel.exists({ institutionId: tid(req) }));
  if (body.isCurrent || first)
    await AcademicSessionModel.updateMany({ institutionId: tid(req) }, { isCurrent: false });
  const s = await AcademicSessionModel.create({
    ...body,
    isCurrent: body.isCurrent || first,
    institutionId: tid(req),
  });
  await audit(req, 'SESSION_CREATED', 'AcademicSession', s._id, body);
  created(res, s);
});

structureRouter.patch('/sessions/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(
    z
      .object({
        name: z.string().trim().min(4).max(30),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        isCurrent: z.boolean(),
      })
      .partial(),
    req.body,
  );
  const s = await AcademicSessionModel.findOne({ _id: id, institutionId: tid(req) });
  if (!s) throw ApiError.notFound('Session');
  if (body.isCurrent === false && s.isCurrent)
    throw ApiError.conflict('Mark another session as current instead.');
  if (body.isCurrent)
    await AcademicSessionModel.updateMany(
      { institutionId: tid(req), _id: { $ne: id } },
      { isCurrent: false },
    );
  s.set(body);
  if (s.endDate <= s.startDate)
    throw ApiError.validation('End date must be after the start date.', {
      fields: { endDate: 'Must be after start date.' },
    });
  await s.save();
  await audit(req, 'SESSION_UPDATED', 'AcademicSession', id, body);
  ok(res, s);
});

structureRouter.delete('/sessions/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (await CampaignModel.exists({ sessionId: id })) throw inUse('admission campaigns');
  const s = await AcademicSessionModel.findOne({ _id: id, institutionId: tid(req) });
  if (!s) throw ApiError.notFound('Session');
  if (s.isCurrent && (await AcademicSessionModel.countDocuments({ institutionId: tid(req) })) > 1) {
    throw ApiError.conflict('Mark another session as current before deleting this one.');
  }
  await s.deleteOne();
  await audit(req, 'SESSION_DELETED', 'AcademicSession', id);
  ok(res, { deleted: true });
});
