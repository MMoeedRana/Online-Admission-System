import { Router } from 'express';
import { z } from 'zod';
import { PROVINCES } from '../../constants/enums';
import { audit } from '../../lib/audit';
import { ApiError, ok } from '../../lib/http';
import { fileStore } from '../../lib/file-store';
import { parse, phoneSchema } from '../../lib/validate';
import { ApplicationModel } from '../applications/application.model';
import { ApplicantDocumentModel } from '../documents/document.models';
import { FileModel } from '../files/file.model';
import { NotificationModel } from '../notifications/notification.models';
import { RecordModel } from '../records/record.models';
import { RefreshTokenModel } from '../auth/token.models';
import { UserModel } from '../users/user.model';
import { ProfileModel, formatCnic } from './profile.model';

export const profileRouter = Router();

const address = z.object({
  line: z.string().trim().min(3, 'Enter the address.').max(200),
  city: z.string().trim().min(2, 'Enter the city.').max(60),
  province: z.enum(PROVINCES),
});

const cnicSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/-/g, ''))
  .pipe(z.string().regex(/^\d{13}$/, 'CNIC / B-Form must have 13 digits, e.g. 35202-1234567-1.'));

export const profileBody = z.object({
  cnic: cnicSchema,
  fullName: z.string().trim().min(3).max(120),
  fatherName: z.string().trim().min(3, "Enter your father's name.").max(120),
  dateOfBirth: z.coerce.date().refine((d) => {
    const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
    return age >= 13 && age <= 70;
  }, 'Enter a valid date of birth.'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone: phoneSchema.refine((v) => v !== '', 'Enter your phone number.'),
  nationality: z.string().trim().min(3).max(40).default('Pakistani'),
  domicile: z.string().trim().min(2, 'Enter your domicile district.').max(60),
  religion: z.string().trim().max(40).default(''),
  guardian: z.object({
    name: z.string().trim().min(3, "Enter the guardian's name.").max(120),
    relation: z.string().trim().min(2).max(40),
    phone: phoneSchema.refine((v) => v !== '', "Enter the guardian's phone."),
    occupation: z.string().trim().max(80).default(''),
  }),
  permanentAddress: address,
  currentAddress: address,
});

profileRouter.get('/', async (req, res) => {
  const p = await ProfileModel.findOne({ userId: req.auth!.userId }).lean();
  ok(res, p ? { ...p, cnicFormatted: formatCnic(p.cnic) } : null);
});

profileRouter.put('/', async (req, res) => {
  const body = parse(profileBody, req.body);
  const userId = req.auth!.userId;
  const taken = await ProfileModel.exists({ cnic: body.cnic, userId: { $ne: userId } });
  if (taken)
    throw ApiError.conflict('This CNIC / B-Form number is already used by another account.', {
      fields: { cnic: 'Already registered.' },
    });
  const existing = await ProfileModel.findOne({ userId });
  const submitted = await ApplicationModel.exists({
    applicantId: userId,
    status: { $nin: ['DRAFT', 'WITHDRAWN'] },
  });
  if (
    existing &&
    submitted &&
    (existing.cnic !== body.cnic ||
      existing.fullName !== body.fullName ||
      existing.fatherName !== body.fatherName)
  ) {
    throw ApiError.conflict(
      "Name, father's name and CNIC cannot be changed after an application is submitted.",
    );
  }
  const p = await ProfileModel.findOneAndUpdate(
    { userId },
    { ...body, userId },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean();
  if (body.fullName) await UserModel.updateOne({ _id: userId }, { fullName: body.fullName });
  await audit(req, existing ? 'PROFILE_UPDATED' : 'PROFILE_CREATED', 'ApplicantProfile', p!._id);
  ok(res, { ...p, cnicFormatted: formatCnic(p!.cnic) });
});

profileRouter.get('/export', async (req, res) => {
  const userId = req.auth!.userId;
  const [user, profile, records, applications, notifications] = await Promise.all([
    UserModel.findById(userId).lean(),
    ProfileModel.findOne({ userId }).lean(),
    RecordModel.find({ userId }).lean(),
    ApplicationModel.find({ applicantId: userId }).select('-notes').lean(),
    NotificationModel.find({ userId }).lean(),
  ]);
  res.setHeader('Content-Disposition', 'attachment; filename="admitra-my-data.json"');
  res.json({
    exportedAt: new Date(),
    account: { fullName: user?.fullName, email: user?.email, createdAt: user?.createdAt },
    profile,
    records,
    applications,
    notifications,
  });
});

profileRouter.delete('/account', async (req, res) => {
  const userId = req.auth!.userId;
  if (await ApplicationModel.exists({ applicantId: userId, status: { $nin: ['DRAFT'] } })) {
    throw ApiError.conflict('Your account cannot be deleted because you have submitted applications.');
  }
  const files = await FileModel.find({ ownerId: userId }).lean();
  const drafts = await ApplicationModel.find({ applicantId: userId }).select('_id').lean();
  await Promise.all([
    ApplicantDocumentModel.deleteMany({ applicationId: { $in: drafts.map((d) => d._id) } }),
    ApplicationModel.deleteMany({ applicantId: userId }),
    RecordModel.deleteMany({ userId }),
    ProfileModel.deleteOne({ userId }),
    NotificationModel.deleteMany({ userId }),
    RefreshTokenModel.deleteMany({ userId }),
    FileModel.deleteMany({ ownerId: userId }),
  ]);
  for (const f of files) await fileStore().remove(f.storageKey);
  await UserModel.deleteOne({ _id: userId });
  await audit(req, 'ACCOUNT_DELETED', 'User', userId);
  res.clearCookie('admitra_rt', { path: '/api/v1/auth' });
  ok(res, { deleted: true });
});
