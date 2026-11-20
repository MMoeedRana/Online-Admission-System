import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { APPLICATION_STATUSES } from '../../constants/applications';
import { SHIFTS } from '../../constants/enums';

const applicationSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true, index: true },
    applicantId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    applicationNumber: { type: String, default: null },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'DRAFT', index: true },
    preferences: [
      {
        _id: false,
        programId: { type: Types.ObjectId, ref: 'Program', required: true },
        shift: { type: String, enum: SHIFTS, required: true },
        order: { type: Number, required: true },
      },
    ],
    snapshot: {
      profile: { type: Schema.Types.Mixed, default: null },
      records: [{ type: Schema.Types.Mixed }],
      fee: { type: Number, default: 0 },
    },
    deficiency: { message: { type: String, default: '' }, at: Date },
    history: [
      {
        _id: false,
        from: String,
        to: String,
        actor: { type: String, enum: ['APPLICANT', 'STAFF', 'SYSTEM'] },
        by: { type: Types.ObjectId, ref: 'User' },
        byName: String,
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    notes: [
      {
        _id: false,
        text: String,
        by: { type: Types.ObjectId, ref: 'User' },
        byName: String,
        at: { type: Date, default: Date.now },
      },
    ],
    submittedAt: Date,
    late: { type: Boolean, default: false },
  },
  { timestamps: true },
);
applicationSchema.index(
  { applicationNumber: 1 },
  { unique: true, partialFilterExpression: { applicationNumber: { $type: 'string' } } },
);
applicationSchema.index({ institutionId: 1, status: 1, submittedAt: -1 });

export type Application = InferSchemaType<typeof applicationSchema>;
export const ApplicationModel = model('Application', applicationSchema);
