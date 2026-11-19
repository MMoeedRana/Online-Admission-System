import { Schema, Types, model } from 'mongoose';

/** Rotating, single-use refresh tokens (AUTH-3). Only the SHA-256 hash is stored. */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);

export const ACTION_TOKEN_TYPES = ['VERIFY_EMAIL', 'RESET_PASSWORD', 'INVITATION'] as const;
export type ActionTokenType = (typeof ACTION_TOKEN_TYPES)[number];

/** Single-use links sent by e-mail (AUTH-5). */
const actionTokenSchema = new Schema(
  {
    type: { type: String, enum: ACTION_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Types.ObjectId, ref: 'User', default: null },
    memberId: { type: Types.ObjectId, ref: 'InstitutionMember', default: null },
    email: { type: String, lowercase: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
actionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const ActionTokenModel = model('ActionToken', actionTokenSchema);
