import { SubscriptionPaymentModel } from './billing.model';
import type { Request } from 'express';
import { env } from '../../config/env';
import { audit } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { sendMail } from '../../lib/mailer';
import { slugify } from '../../lib/slug';
import { createActionToken } from '../auth/auth.service';
import { InstitutionModel } from '../institutions/institution.model';
import { PlanModel } from '../plans/plan.model';
import { MemberModel } from '../staff/member.model';
import { UserModel } from '../users/user.model';
import { ensureDefaultDocumentTypes } from '../documents/document.models';
import type { Id } from '../../lib/types';
import { brand } from '../../lib/brand';

const DAY = 24 * 60 * 60 * 1000;

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'institution';
  let slug = base;
  for (let i = 2; await InstitutionModel.exists({ slug }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function inviteMember(
  req: Request,
  institution: { _id: Id; name: string },
  data: { email: string; fullName?: string; designation?: string; roles: string[]; departmentIds?: string[] },
) {
  const existing = await MemberModel.findOne({ institutionId: institution._id, email: data.email });
  if (existing && existing.status !== 'INVITED') {
    throw ApiError.conflict('This person is already a staff member of the institution.', {
      fields: { email: 'Already a member.' },
    });
  }
  const applicant = await UserModel.exists({ email: data.email, accountType: 'APPLICANT' });
  if (applicant) {
    throw ApiError.conflict('This e-mail belongs to an applicant account and cannot be used for staff.', {
      fields: { email: 'Applicant account e-mail.' },
    });
  }
  const member =
    existing ??
    (new MemberModel({
      institutionId: institution._id,
      email: data.email,
      status: 'INVITED',
      invitedBy: req.auth?.userId,
    }) as unknown as NonNullable<typeof existing>);
  member.fullName = data.fullName ?? member.fullName;
  member.designation = data.designation ?? member.designation;
  member.set('roles', data.roles);
  member.set('departmentIds', data.departmentIds ?? []);
  await member.save();
  await sendInvitation(member, institution.name);
  return member;
}

export async function sendInvitation(
  member: { _id: Id; email: string; fullName?: string | null },
  institutionName: string,
) {
  const raw = await createActionToken('INVITATION', { memberId: member._id, email: member.email });
  await sendMail({
    to: member.email,
    subject: `You are invited to ${institutionName} on ${brand().platformName}`,
    heading: 'Staff invitation',
    paragraphs: [
      `Hello${member.fullName ? ' ' + member.fullName : ''}, you have been invited to join <b>${institutionName}</b> on ${brand().platformName}.`,
      'Open the link to set your password and join the workspace. The invitation can be used once and is valid for 7 days.',
    ],
    action: { label: 'Accept invitation', url: `${env.WEB_URL}/accept-invitation?token=${raw}` },
  });
}

export async function approveInstitution(req: Request, id: string, planId: string, trialDays?: number) {
  const inst = await InstitutionModel.findById(id);
  if (!inst) throw ApiError.notFound('Institution');
  if (inst.status !== 'PENDING') throw ApiError.conflict('Only pending requests can be approved.');
  const plan = await PlanModel.findOne({ _id: planId, status: 'ACTIVE' });
  if (!plan)
    throw ApiError.validation('Select an active plan.', { fields: { planId: 'Select an active plan.' } });

  const days = trialDays ?? plan.trialDays;
  const now = new Date();
  inst.status = 'ACTIVE';
  inst.statusReason = '';
  inst.planId = plan._id;
  inst.subscription = { startsAt: now, endsAt: new Date(now.getTime() + days * DAY), isTrial: true };
  inst.approvedAt = now;
  inst.set('approvedBy', req.auth?.userId);
  await inst.save();

  await ensureDefaultDocumentTypes(inst._id);
  await inviteMember(req, inst, {
    email: inst.contact!.email,
    fullName: inst.contact!.name,
    designation: inst.contact!.designation,
    roles: ['INSTITUTION_ADMIN'],
  });
  await audit(
    req,
    'INSTITUTION_APPROVED',
    'Institution',
    inst._id,
    { plan: plan.code, trialDays: days },
    { institutionId: inst._id },
  );
  return inst;
}

export async function rejectInstitution(req: Request, id: string, reason: string) {
  const inst = await InstitutionModel.findById(id);
  if (!inst) throw ApiError.notFound('Institution');
  if (inst.status !== 'PENDING') throw ApiError.conflict('Only pending requests can be rejected.');
  inst.status = 'REJECTED';
  inst.statusReason = reason;
  await inst.save();
  await sendMail({
    to: inst.contact!.email,
    subject: `Your ${brand().platformName} onboarding request`,
    heading: 'Onboarding request not approved',
    paragraphs: [
      `Dear ${inst.contact!.name}, the request for <b>${inst.name}</b> was not approved.`,
      `Reason: ${reason}`,
    ],
  });
  await audit(req, 'INSTITUTION_REJECTED', 'Institution', inst._id, { reason }, { institutionId: inst._id });
  return inst;
}

export async function setSuspended(req: Request, id: string, suspend: boolean, reason = '') {
  const inst = await InstitutionModel.findById(id);
  if (!inst) throw ApiError.notFound('Institution');
  if (suspend && inst.status !== 'ACTIVE')
    throw ApiError.conflict('Only active institutions can be suspended.');
  if (!suspend && inst.status !== 'SUSPENDED')
    throw ApiError.conflict('Only suspended institutions can be re-activated.');
  inst.status = suspend ? 'SUSPENDED' : 'ACTIVE';
  inst.statusReason = suspend ? reason : '';
  await inst.save();
  await audit(
    req,
    suspend ? 'INSTITUTION_SUSPENDED' : 'INSTITUTION_REACTIVATED',
    'Institution',
    inst._id,
    { reason },
    { institutionId: inst._id },
  );
  return inst;
}

export async function renewSubscription(
  req: Request,
  id: string,
  months: number,
  planId?: string,
  payment: {
    amount?: number;
    method?: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'ONLINE';
    reference?: string;
  } = {},
) {
  const inst = await InstitutionModel.findById(id);
  if (!inst) throw ApiError.notFound('Institution');
  if (!['ACTIVE', 'SUSPENDED'].includes(inst.status))
    throw ApiError.conflict('Only approved institutions can be renewed.');
  if (planId) {
    const plan = await PlanModel.findOne({ _id: planId, status: 'ACTIVE' });
    if (!plan)
      throw ApiError.validation('Select an active plan.', { fields: { planId: 'Select an active plan.' } });
    inst.planId = plan._id;
  }
  const now = new Date();
  const from = inst.subscription?.endsAt && inst.subscription.endsAt > now ? inst.subscription.endsAt : now;
  const endsAt = new Date(from);
  endsAt.setMonth(endsAt.getMonth() + months);
  inst.subscription = { startsAt: inst.subscription?.startsAt ?? now, endsAt, isTrial: false };
  await inst.save();
  const plan = await PlanModel.findById(inst.planId).lean();
  if (plan)
    await SubscriptionPaymentModel.create({
      institutionId: inst._id,
      planId: plan._id,
      planName: plan.name,
      months,
      amount: payment.amount ?? plan.priceMonthly * months,
      method: payment.method ?? 'BANK_TRANSFER',
      reference: payment.reference ?? '',
      periodStart: from,
      periodEnd: endsAt,
      recordedBy: req.auth?.userId ?? null,
      recordedByName: req.auth?.name ?? '',
    });
  await audit(
    req,
    'SUBSCRIPTION_RENEWED',
    'Institution',
    inst._id,
    { months, endsAt, planId },
    { institutionId: inst._id },
  );
  return inst;
}
