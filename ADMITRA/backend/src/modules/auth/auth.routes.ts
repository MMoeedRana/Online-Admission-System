import { Router } from 'express';
import { z } from 'zod';
import { created, ok } from '../../lib/http';
import { emailSchema, parse, passwordSchema } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { UserModel, publicUser } from '../users/user.model';
import * as auth from './auth.service';
import { ApiError } from '../../lib/http';

export const authRouter = Router();

const nameSchema = z.string().trim().min(3, 'Enter your full name.').max(120);

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ fullName: nameSchema, email: emailSchema, password: passwordSchema }),
    req.body,
  );
  created(res, await auth.registerApplicant(req, res, body));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password.') }),
    req.body,
  );
  ok(res, await auth.login(req, res, body));
});

authRouter.post('/refresh', async (req, res) => {
  ok(res, await auth.refresh(req, res));
});

authRouter.post('/logout', async (req, res) => {
  await auth.logout(req, res);
  ok(res, { loggedOut: true });
});

authRouter.post('/verify-email', authLimiter, async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(10) }), req.body);
  await auth.verifyEmail(token);
  ok(res, { verified: true });
});

authRouter.post('/resend-verification', authenticate, authLimiter, async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId);
  if (!user) throw ApiError.notFound('User');
  if (!user.emailVerified) await auth.sendVerificationEmail(user);
  ok(res, { sent: !user.emailVerified });
});

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body);
  await auth.forgotPassword(email);
  ok(res, { sent: true });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(10), password: passwordSchema }), req.body);
  await auth.resetPassword(body.token, body.password);
  ok(res, { reset: true });
});

authRouter.get('/invitation', async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(10) }), req.query);
  ok(res, await auth.invitationPreview(token));
});

authRouter.post('/accept-invitation', authLimiter, async (req, res) => {
  const body = parse(
    z.object({ token: z.string().min(10), fullName: nameSchema.optional(), password: z.string().optional() }),
    req.body,
  );
  if (body.password) parse(z.object({ password: passwordSchema }), { password: body.password });
  ok(res, await auth.acceptInvitation(req, res, body));
});

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId);
  if (!user) throw ApiError.unauthorized();
  ok(res, { user: publicUser(user), memberships: await auth.membershipsOf(user._id) });
});

authRouter.patch('/me', authenticate, async (req, res) => {
  const body = parse(
    z.object({ fullName: nameSchema.optional(), theme: z.enum(['light', 'dark', 'system']).optional() }),
    req.body,
  );
  const user = await UserModel.findByIdAndUpdate(req.auth!.userId, body, { returnDocument: 'after' });
  if (!user) throw ApiError.notFound('User');
  ok(res, { user: publicUser(user) });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
  await auth.changePassword(req.auth!.userId, body.currentPassword, body.newPassword);
  ok(res, { changed: true });
});
