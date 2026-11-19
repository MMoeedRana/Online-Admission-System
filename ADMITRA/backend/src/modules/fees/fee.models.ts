import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { PAYMENT_METHODS } from '../../constants/applications';

/** FEE-2: bank challan. */
const voucherSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    applicationId: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    applicantId: { type: Types.ObjectId, ref: 'User', required: true },
    voucherNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['APPLICATION', 'ADMISSION'], required: true },
    items: [{ _id: false, label: String, amount: Number }],
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['ISSUED', 'AWAITING_VERIFICATION', 'PAID', 'EXPIRED', 'CANCELLED'],
      default: 'ISSUED',
    },
  },
  { timestamps: true },
);
export type FeeVoucher = InferSchemaType<typeof voucherSchema>;
export const VoucherModel = model('FeeVoucher', voucherSchema);

/** FEE-3/FEE-4: proof of payment and the finance decision. */
const paymentSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    voucherId: { type: Types.ObjectId, ref: 'FeeVoucher', required: true, index: true },
    applicationId: { type: Types.ObjectId, ref: 'Application', required: true },
    applicantId: { type: Types.ObjectId, ref: 'User', required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, required: true, trim: true, uppercase: true },
    amount: { type: Number, required: true },
    paidOn: { type: Date, required: true },
    proofFileId: { type: Types.ObjectId, ref: 'StoredFile', required: true },
    status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING', index: true },
    receiptNumber: { type: String, default: null },
    reason: { type: String, default: '' },
    decidedBy: { type: Types.ObjectId, ref: 'User', default: null },
    decidedByName: { type: String, default: '' },
    decidedAt: Date,
  },
  { timestamps: true },
);
paymentSchema.index({ institutionId: 1, reference: 1 }, { unique: true });
paymentSchema.index(
  { receiptNumber: 1 },
  { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' } } },
);
export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model('Payment', paymentSchema);
