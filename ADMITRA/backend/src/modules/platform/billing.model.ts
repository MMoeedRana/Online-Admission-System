import { Schema, Types, model } from 'mongoose';

const subscriptionPaymentSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    planId: { type: Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planName: { type: String, required: true },
    months: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'ONLINE'], default: 'BANK_TRANSFER' },
    reference: { type: String, default: '', trim: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    recordedBy: { type: Types.ObjectId, ref: 'User', default: null },
    recordedByName: { type: String, default: '' },
  },
  { timestamps: true },
);
subscriptionPaymentSchema.index({ createdAt: -1 });
export const SubscriptionPaymentModel = model('SubscriptionPayment', subscriptionPaymentSchema);
