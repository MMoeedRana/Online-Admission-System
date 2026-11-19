import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { INSTITUTION_STATUSES, INSTITUTION_TYPES, PROVINCES, SECTORS } from '../../constants/enums';

export const GRACE_DAYS = 7;

const institutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    type: { type: String, enum: INSTITUTION_TYPES, required: true },
    sector: { type: String, enum: SECTORS, default: 'PRIVATE' },
    city: { type: String, required: true, trim: true },
    province: { type: String, enum: PROVINCES, required: true },
    website: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    about: { type: String, default: '' },
    contact: {
      name: { type: String, required: true },
      designation: { type: String, default: '' },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, default: '' },
    },
    status: { type: String, enum: INSTITUTION_STATUSES, default: 'PENDING', index: true },
    statusReason: { type: String, default: '' },
    planId: { type: Types.ObjectId, ref: 'SubscriptionPlan', default: null },
    subscription: {
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
      isTrial: { type: Boolean, default: false },
    },
    branding: {
      logoUrl: { type: String, default: '' },
      primaryColor: { type: String, default: '#1F6FEB' },
    },
    bankAccount: {
      bankName: { type: String, default: '' },
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      iban: { type: String, default: '' },
    },
    settings: {
      eligibilityAsSeparateStep: { type: Boolean, default: true },
    },
    approvedAt: Date,
    approvedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type Institution = InferSchemaType<typeof institutionSchema>;
export const InstitutionModel = model('Institution', institutionSchema);

export type SubscriptionState = 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'NONE';

/** INST-4: after the end date the workspace has 7 days of grace, then becomes read-only. */
export function subscriptionState(
  inst: { subscription?: { endsAt?: Date | null } | null },
  now = new Date(),
): SubscriptionState {
  const endsAt = inst.subscription?.endsAt;
  if (!endsAt) return 'NONE';
  if (now <= endsAt) return 'ACTIVE';
  const graceEnd = new Date(endsAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  return now <= graceEnd ? 'GRACE' : 'READ_ONLY';
}
