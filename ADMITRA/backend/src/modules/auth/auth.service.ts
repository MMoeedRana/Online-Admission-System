import { PlanModel } from '../plans/plan.model';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { permissionsFor } from '../../constants/permissions';
import type { StaffRole } from '../../constants/roles';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto';
import { ApiError } from '../../lib/http';
import { sendMail } from '../../lib/mailer';
import { signAccessToken } from '../../middleware/auth';
import { InstitutionModel } from '../institutions/institution.model';
import { MemberModel } from '../staff/member.model';
import { UserModel, publicUser, type UserDoc } from '../users/user.model';
import type { Id } from '../../lib/types';
import { ActionTokenModel, RefreshTokenModel, type ActionTokenType } from './token.models';
import { brand } from '../../lib/brand';

export const REFRESH_COOKIE = 'admitra_rt';
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export const TOKEN_LIFETIME_MINUTES: Record<ActionTokenType, number> = {
  VERIFY_EMAIL: 24 * 60,
  RESET_PASSWORD: 30,
  INVITATION: 7 * 24 * 60,
};

export async function createActionToken(
  type: ActionTokenType,
  data: { userId?: Id; memberId?: Id; email: string },
): Promise<string> {
  const raw = randomToken(32);
  await ActionTokenModel.create({
    type,
    tokenHash: sha256(raw),
    userId: data.userId ?? null,
    memberId: data.memberId ?? null,
    email: data.email,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MINUTES[type] * 60 * 1000),
  });
  return raw;
}

export async function consumeActionToken(type: ActionTokenType, raw: string, peek = false) {
  const token = await ActionTokenModel.findOne({ type, tokenHash: sha256(raw) });
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    throw new ApiError(400, 'INVALID_LINK', 'This link is invalid, already used or expired.');
  }
  if (!peek) {
    token.usedAt = new Date();
    await token.save();
  }
  return token;
}

export async function sendVerificationEmail(user: { _id: Id; email: string; fullName: string }) {
  const raw = await createActionToken('VERIFY_EMAIL', { userId: user._id, email: user.email });
  await sendMail({
    to: user.email,
    subject: 'Verify your e-mail address',
    heading: `Welcome to ${brand().platformName}, ${user.fullName}`,
    paragraphs: [
      'Please confirm your e-mail address to secure your account. This link can be used once and is valid for 24 hours.',
    ],
    action: { label: 'Verify e-mail', url: `${env.WEB_URL}/verify-email?token=${raw}` },
  });
}

export async function membershipsOf(userId: Id) {
  const members = await MemberModel.find({ userId, status: 'ACTIVE' }).lean();
  if (!members.length) return [];
  const insts = await InstitutionModel.find({ _id: { $in: members.map((m) => m.institutionId) } })
    .select('name shortName slug status branding city planId')
    .lean();
  const plans = await PlanModel.find({ _id: { $in: insts.map((i) => i.planId).filter(Boolean) } })
    .select('features')
    .lean();
  return members
    .map((m) => {
      const i = insts.find((x) => String(x._id) === String(m.institutionId));
      if (!i) return null;
      const roles = m.roles as StaffRole[];
      return {
        institutionId: String(i._id),
        name: i.name,
        shortName: i.shortName,
        slug: i.slug,
        city: i.city,
        status: i.status,
        logoUrl: i.branding?.logoUrl ?? '',
        ai: {
          copilot: Boolean(plans.find((p) => String(p._id) === String(i.planId))?.features?.aiCopilot),
          briefing: Boolean(plans.find((p) => String(p._id) === String(i.planId))?.features?.aiBriefing),
        },
        branding: {
          active: Boolean(plans.find((p) => String(p._id) === String(i.planId))?.features?.customBranding),
          logoUrl: i.branding?.logoUrl ?? '',
          primaryColor: i.branding?.primaryColor ?? '',
          sidebarColor: i.branding?.sidebarColor ?? '',
        },
        roles,
        permissions: permissionsFor(roles),
      };
    })
    .filter((x) => x !== null);
}

function setRefreshCookie(res: Response, raw: string) {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

async function issueRefreshToken(req: Request, res: Response, userId: Id, family?: string) {
  const raw = randomToken(48);
  await RefreshTokenModel.create({
    userId,
    tokenHash: sha256(raw),
    family: family ?? randomToken(12),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
    ip: req.ip,
  });
  setRefreshCookie(res, raw);
}

export async function sessionPayload(user: UserDoc) {
  return {
    accessToken: signAccessToken({
      sub: String(user._id),
      typ: user.accountType,
      role: user.platformRole ?? null,
      name: user.fullName,
    }),
    user: publicUser(user),
    memberships: await membershipsOf(user._id),
  };
}

export async function startSession(req: Request, res: Response, user: UserDoc, family?: string) {
  await issueRefreshToken(req, res, user._id, family);
  return sessionPayload(user);
}

export async function registerApplicant(
  req: Request,
  res: Response,
  input: { fullName: string; email: string; password: string },
) {
  if (await UserModel.exists({ email: input.email })) {
    throw ApiError.conflict('An account with this e-mail already exists.', {
      fields: { email: 'This e-mail is already registered.' },
    });
  }
  const user = await UserModel.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    accountType: 'APPLICANT',
  });
  await sendVerificationEmail(user);
  return startSession(req, res, user);
}

export async function login(req: Request, res: Response, input: { email: string; password: string }) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  const invalid = new ApiError(401, 'INVALID_CREDENTIALS', 'The e-mail or password is not correct.');
  if (!user) throw invalid;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(
      423,
      'ACCOUNT_LOCKED',
      `Too many failed attempts. Your account is locked for ${minutes} more minute(s).`,
    );
  }
  if (user.status !== 'ACTIVE')
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED_LOGINS) {
      user.failedLogins = 0;
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      await user.save();
      throw new ApiError(
        423,
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes.`,
      );
    }
    await user.save();
    throw invalid;
  }

  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();
  return startSession(req, res, user);
}

export async function refresh(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw ApiError.unauthorized('Your session has ended. Please sign in again.');
  const token = await RefreshTokenModel.findOne({ tokenHash: sha256(raw) });
  if (!token || token.expiresAt < new Date()) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Your session has ended. Please sign in again.');
  }
  if (token.usedAt || token.revokedAt) {
    await RefreshTokenModel.updateMany({ family: token.family, revokedAt: null }, { revokedAt: new Date() });
    clearRefreshCookie(res);
    throw new ApiError(
      401,
      'TOKEN_REUSED',
      'For your security this session was ended. Please sign in again.',
    );
  }
  token.usedAt = new Date();
  await token.save();

  const user = await UserModel.findById(token.userId);
  if (!user || user.status !== 'ACTIVE') {
    clearRefreshCookie(res);
    throw ApiError.unauthorized();
  }
  return startSession(req, res, user, token.family);
}

export async function logout(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    const token = await RefreshTokenModel.findOne({ tokenHash: sha256(raw) });
    if (token)
      await RefreshTokenModel.updateMany(
        { family: token.family, revokedAt: null },
        { revokedAt: new Date() },
      );
  }
  clearRefreshCookie(res);
}

export async function verifyEmail(raw: string) {
  const token = await consumeActionToken('VERIFY_EMAIL', raw);
  await UserModel.updateOne({ _id: token.userId }, { emailVerified: true });
}

export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email, status: 'ACTIVE' });
  if (!user) return;
  const raw = await createActionToken('RESET_PASSWORD', { userId: user._id, email: user.email });
  await sendMail({
    to: user.email,
    subject: `Reset your ${brand().platformName} password`,
    heading: 'Password reset request',
    paragraphs: [
      `Hello ${user.fullName}, we received a request to reset your password.`,
      'This link can be used once and is valid for 30 minutes. If you did not ask for it, you can ignore this e-mail.',
    ],
    action: { label: 'Set a new password', url: `${env.WEB_URL}/reset-password?token=${raw}` },
  });
}

export async function resetPassword(raw: string, password: string) {
  const token = await consumeActionToken('RESET_PASSWORD', raw);
  await UserModel.updateOne(
    { _id: token.userId },
    { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, emailVerified: true },
  );
  await RefreshTokenModel.updateMany({ userId: token.userId, revokedAt: null }, { revokedAt: new Date() });
}

export async function invitationPreview(raw: string) {
  const token = await consumeActionToken('INVITATION', raw, true);
  const member = await MemberModel.findById(token.memberId).lean();
  if (!member || member.status !== 'INVITED')
    throw new ApiError(400, 'INVALID_LINK', 'This invitation is no longer valid.');
  const institution = await InstitutionModel.findById(member.institutionId).select('name shortName').lean();
  const existing = await UserModel.exists({ email: member.email });
  return {
    email: member.email,
    fullName: member.fullName,
    roles: member.roles,
    institutionName: institution?.name ?? '',
    existingAccount: Boolean(existing),
  };
}

export async function acceptInvitation(
  req: Request,
  res: Response,
  input: { token: string; fullName?: string; password?: string },
) {
  const token = await consumeActionToken('INVITATION', input.token, true);
  const member = await MemberModel.findById(token.memberId);
  if (!member || member.status !== 'INVITED')
    throw new ApiError(400, 'INVALID_LINK', 'This invitation is no longer valid.');

  let user = await UserModel.findOne({ email: member.email }).select('+passwordHash');
  if (user) {
    if (user.accountType === 'APPLICANT') {
      throw ApiError.conflict(
        'This e-mail belongs to an applicant account. Please ask the admin to invite a different e-mail.',
      );
    }
    if (!input.password || !(await verifyPassword(user.passwordHash, input.password))) {
      throw ApiError.validation(
        `Please enter the password of your existing ${brand().platformName} account.`,
        {
          fields: { password: 'Incorrect password.' },
        },
      );
    }
  } else {
    if (!input.fullName || !input.password) {
      throw ApiError.validation('Please enter your name and choose a password.', {
        fields: {
          fullName: !input.fullName ? 'Required' : undefined,
          password: !input.password ? 'Required' : undefined,
        },
      });
    }
    user = await UserModel.create({
      fullName: input.fullName,
      email: member.email,
      passwordHash: await hashPassword(input.password),
      accountType: 'STAFF',
      emailVerified: true,
    });
  }
  await consumeActionToken('INVITATION', input.token);
  member.userId = user._id;
  member.status = 'ACTIVE';
  member.fullName = user.fullName;
  member.joinedAt = new Date();
  await member.save();
  return startSession(req, res, user);
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');
  if (!(await verifyPassword(user.passwordHash, current))) {
    throw ApiError.validation('The current password is not correct.', {
      fields: { currentPassword: 'Incorrect password.' },
    });
  }
  user.passwordHash = await hashPassword(next);
  await user.save();
}
