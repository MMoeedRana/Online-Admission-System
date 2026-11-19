import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { CAMPAIGN_STATUSES, DUPLICATE_POLICIES, FEE_POLICIES, LATE_POLICIES } from '../../constants/enums';

const campaignSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    sessionId: { type: Types.ObjectId, ref: 'AcademicSession', required: true },
    title: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    programs: [
      {
        _id: false,
        programId: { type: Types.ObjectId, ref: 'Program', required: true },
        seatCap: { type: Number, default: null, min: 1 },
      },
    ],
    settings: {
      maxPreferences: { type: Number, default: 3, min: 1, max: 10 },
      duplicatePolicy: { type: String, enum: DUPLICATE_POLICIES, default: 'ONE_ACTIVE' },
      latePolicy: { type: String, enum: LATE_POLICIES, default: 'REFUSE' },
      feePolicy: { type: String, enum: FEE_POLICIES, default: 'HIGHEST' },
      minTrustLevel: { type: Number, enum: [0, 1, 2, 3], default: 2 },
    },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'DRAFT', index: true },
    history: [
      {
        _id: false,
        from: String,
        to: String,
        by: { type: Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        auto: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);
campaignSchema.index({ institutionId: 1, code: 1 }, { unique: true });

export type Campaign = InferSchemaType<typeof campaignSchema>;
export const CampaignModel = model('AdmissionCampaign', campaignSchema);
