import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { permissionsFor, type Permission } from '../constants/permissions';
import type { StaffRole } from '../constants/roles';
import { ApiError } from '../lib/http';
import { InstitutionModel, subscriptionState } from '../modules/institutions/institution.model';
import { MemberModel } from '../modules/staff/member.model';

/**
 * Resolves the institution (tenant) of a staff request from the X-Institution-Id header and
 * checks that the user is an active member of it (SEC-1). Suspended institutions are blocked
 * immediately (INST-5) and expired subscriptions become read-only after the grace period (INST-4).
 */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  const id = String(req.headers['x-institution-id'] ?? '');
  if (!req.auth) throw ApiError.unauthorized();
  if (!Types.ObjectId.isValid(id)) throw ApiError.badRequest('Institution is not selected.');

  const member = await MemberModel.findOne({
    institutionId: id,
    userId: req.auth.userId,
    status: 'ACTIVE',
  }).lean();
  if (!member) throw ApiError.notFound('Institution');

  const institution = await InstitutionModel.findById(id).lean();
  if (!institution) throw ApiError.notFound('Institution');
  if (institution.status !== 'ACTIVE') {
    throw new ApiError(
      403,
      'INSTITUTION_SUSPENDED',
      'This institution workspace is not active. Please contact ADMITRA support.',
    );
  }

  const state = subscriptionState(institution);
  if (state === 'READ_ONLY' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    throw new ApiError(
      403,
      'SUBSCRIPTION_EXPIRED',
      'The subscription of this institution has expired. The workspace is read-only until it is renewed.',
    );
  }

  const roles = (member.roles ?? []) as StaffRole[];
  req.tenant = {
    institutionId: id,
    institution: institution as never,
    memberId: String(member._id),
    roles,
    departmentIds: (member.departmentIds ?? []).map(String),
    permissions: permissionsFor(roles),
    subscription: state,
  };
  next();
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const have = req.tenant?.permissions ?? [];
    if (!perms.some((p) => have.includes(p))) throw ApiError.forbidden();
    next();
  };
}
