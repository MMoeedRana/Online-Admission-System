import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ACCOUNT_TYPES, PLATFORM_ROLES } from '../../constants/roles';

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    accountType: { type: String, enum: ACCOUNT_TYPES, required: true },
    platformRole: { type: String, enum: [...PLATFORM_ROLES, null], default: null },
    emailVerified: { type: Boolean, default: false },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model('User', userSchema);

export function publicUser(u: UserDoc | (User & { _id: unknown })) {
  return {
    id: String(u._id),
    fullName: u.fullName,
    email: u.email,
    accountType: u.accountType,
    platformRole: u.platformRole ?? null,
    emailVerified: u.emailVerified,
    theme: u.theme,
  };
}
