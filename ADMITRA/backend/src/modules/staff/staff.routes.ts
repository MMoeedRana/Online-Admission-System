import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { STAFF_ROLES } from '../../constants/roles';
import { audit } from '../../lib/audit';
import { ApiError, created, ok } from '../../lib/http';
import { emailSchema, idParams, objectId, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { assertWithinLimit } from '../institutions/limits';
import { inviteMember, sendInvitation } from '../platform/platform.service';
import { DepartmentModel } from '../structure/structure.models';
import { MemberModel } from './member.model';

export const staffRouter = Router();
staffRouter.use(requirePermission(PERMISSIONS.STAFF_MANAGE));

const rolesSchema = z.array(z.enum(STAFF_ROLES)).min(1, 'Select at least one role.');

async function checkDepartments(institutionId: string, roles: string[], departmentIds: string[]) {
  if (roles.includes('HOD_OFFICER') && departmentIds.length === 0) {
    throw ApiError.validation('Assign at least one department to a HOD officer.', {
      fields: { departmentIds: 'Required for HOD officers.' },
    });
  }
  if (departmentIds.length) {
    const n = await DepartmentModel.countDocuments({ institutionId, _id: { $in: departmentIds } });
    if (n !== departmentIds.length)
      throw ApiError.validation('Unknown department.', { fields: { departmentIds: 'Unknown department.' } });
  }
}

async function assertKeepsAnAdmin(institutionId: string, memberId: string) {
  const admins = await MemberModel.countDocuments({
    institutionId,
    status: 'ACTIVE',
    roles: 'INSTITUTION_ADMIN',
    _id: { $ne: memberId },
  });
  if (admins === 0)
    throw ApiError.conflict('The institution must keep at least one active Institution Admin.');
}

staffRouter.get('/', async (req, res) => {
  const items = await MemberModel.find({ institutionId: req.tenant!.institutionId })
    .sort({ status: 1, createdAt: 1 })
    .populate('departmentIds', 'name code')
    .lean();
  ok(res, items);
});

staffRouter.post('/invite', async (req, res) => {
  const t = req.tenant!;
  const body = parse(
    z.object({
      email: emailSchema,
      fullName: z.string().trim().min(3).max(120),
      designation: z.string().trim().max(80).default(''),
      roles: rolesSchema,
      departmentIds: z.array(objectId).default([]),
    }),
    req.body,
  );
  await checkDepartments(t.institutionId, body.roles, body.departmentIds);
  const exists = await MemberModel.exists({ institutionId: t.institutionId, email: body.email });
  if (!exists) await assertWithinLimit(t.institution, 'staff');
  const member = await inviteMember(req, t.institution as never, body);
  await audit(req, 'STAFF_INVITED', 'InstitutionMember', member._id, {
    email: body.email,
    roles: body.roles,
  });
  created(res, member);
});

staffRouter.patch('/:id', async (req, res) => {
  const t = req.tenant!;
  const { id } = parse(idParams, req.params);
  const body = parse(
    z.object({
      roles: rolesSchema.optional(),
      departmentIds: z.array(objectId).optional(),
      designation: z.string().trim().max(80).optional(),
    }),
    req.body,
  );
  const member = await MemberModel.findOne({ _id: id, institutionId: t.institutionId });
  if (!member) throw ApiError.notFound('Staff member');
  const roles = body.roles ?? (member.roles as string[]);
  await checkDepartments(t.institutionId, roles, body.departmentIds ?? member.departmentIds.map(String));
  if (
    member.roles.includes('INSTITUTION_ADMIN') &&
    !roles.includes('INSTITUTION_ADMIN') &&
    member.status === 'ACTIVE'
  ) {
    await assertKeepsAnAdmin(t.institutionId, id);
  }
  if (body.roles) member.set('roles', body.roles);
  if (body.departmentIds) member.set('departmentIds', body.departmentIds);
  if (body.designation !== undefined) member.designation = body.designation;
  await member.save();
  await audit(req, 'STAFF_ROLES_CHANGED', 'InstitutionMember', member._id, body);
  ok(res, member);
});

staffRouter.post('/:id/status', async (req, res) => {
  const t = req.tenant!;
  const { id } = parse(idParams, req.params);
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }), req.body);
  const member = await MemberModel.findOne({ _id: id, institutionId: t.institutionId });
  if (!member) throw ApiError.notFound('Staff member');
  if (member.status === 'INVITED')
    throw ApiError.conflict('This person has not accepted the invitation yet.');
  if (String(member._id) === t.memberId) throw ApiError.conflict('You cannot change your own status.');
  if (status === 'DISABLED' && member.roles.includes('INSTITUTION_ADMIN'))
    await assertKeepsAnAdmin(t.institutionId, id);
  if (status === 'ACTIVE' && member.status === 'DISABLED') await assertWithinLimit(t.institution, 'staff');
  member.status = status;
  await member.save();
  await audit(req, status === 'ACTIVE' ? 'STAFF_ENABLED' : 'STAFF_DISABLED', 'InstitutionMember', member._id);
  ok(res, member);
});

staffRouter.post('/:id/resend-invite', async (req, res) => {
  const t = req.tenant!;
  const { id } = parse(idParams, req.params);
  const member = await MemberModel.findOne({ _id: id, institutionId: t.institutionId, status: 'INVITED' });
  if (!member) throw ApiError.notFound('Pending invitation');
  await sendInvitation(member, t.institution.name);
  ok(res, { sent: true });
});

staffRouter.delete('/:id', async (req, res) => {
  const t = req.tenant!;
  const { id } = parse(idParams, req.params);
  const member = await MemberModel.findOne({ _id: id, institutionId: t.institutionId, status: 'INVITED' });
  if (!member)
    throw ApiError.conflict('Only pending invitations can be cancelled. Disable active staff instead.');
  await member.deleteOne();
  await audit(req, 'STAFF_INVITATION_CANCELLED', 'InstitutionMember', id, { email: member.email });
  ok(res, { deleted: true });
});
