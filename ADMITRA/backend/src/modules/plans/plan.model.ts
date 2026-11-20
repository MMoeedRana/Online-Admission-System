import { Schema, model, type InferSchemaType } from 'mongoose';

const planSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priceMonthly: { type: Number, required: true, min: 0 },
    trialDays: { type: Number, default: 30, min: 0 },
    limits: {
      campuses: { type: Number, required: true, min: 1 },
      programs: { type: Number, required: true, min: 1 },
      staff: { type: Number, required: true, min: 1 },
      applicationsPerCycle: { type: Number, required: true, min: 1 },
    },
    features: {
      multipleCampuses: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      advancedAnalytics: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      aiCopilot: { type: Boolean, default: false },
      aiBriefing: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['ACTIVE', 'RETIRED'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

export type Plan = InferSchemaType<typeof planSchema>;
export const PlanModel = model('SubscriptionPlan', planSchema);
