import { ApiError } from '../../lib/http';
import { PlanModel } from '../plans/plan.model';
import { ProgramModel } from '../programs/program.model';
import { MemberModel } from '../staff/member.model';
import { CampusModel } from '../structure/structure.models';
import type { Id } from '../../lib/types';
import { brand } from '../../lib/brand';

export type LimitKey = 'campuses' | 'programs' | 'staff';

export async function planOf(institution: { planId?: unknown }) {
  const plan = institution.planId ? await PlanModel.findById(institution.planId as Id).lean() : null;
  if (!plan) throw new ApiError(403, 'NO_PLAN', 'This institution has no subscription plan.');
  return plan;
}

export async function usageOf(institutionId: Id) {
  const [campuses, programs, staff] = await Promise.all([
    CampusModel.countDocuments({ institutionId }),
    ProgramModel.countDocuments({ institutionId, status: 'ACTIVE' }),
    MemberModel.countDocuments({ institutionId, status: { $in: ['ACTIVE', 'INVITED'] } }),
  ]);
  return { campuses, programs, staff };
}

const LABELS: Record<LimitKey, string> = {
  campuses: 'campuses',
  programs: 'active programs',
  staff: 'staff members',
};

export async function assertWithinLimit(institution: { _id: unknown; planId?: unknown }, key: LimitKey) {
  const plan = await planOf(institution);
  const usage = await usageOf(institution._id as Id);
  let limit = plan.limits![key];
  if (key === 'campuses' && !plan.features!.multipleCampuses) limit = 1;
  if (usage[key] >= limit) {
    throw new ApiError(
      403,
      'PLAN_LIMIT_REACHED',
      `Your ${plan.name} plan allows ${limit} ${LABELS[key]}. Please contact ${brand().platformName} to upgrade the plan.`,
      { limit, used: usage[key], key },
    );
  }
}
