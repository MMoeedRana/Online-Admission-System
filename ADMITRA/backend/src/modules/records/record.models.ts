import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { EXAM_TYPES, RECORD_LEVELS, VERIFICATION_STATUSES } from '../../constants/academics';

const subject = new Schema(
  {
    name: { type: String, required: true },
    obtained: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const recordSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    level: { type: String, enum: RECORD_LEVELS, required: true },
    board: { type: String, required: true, trim: true },
    examType: { type: String, enum: EXAM_TYPES, default: 'ANNUAL' },
    testName: { type: String, default: '' },
    group: { type: String, default: '', trim: true },
    year: { type: Number, required: true },
    rollNo: { type: String, required: true, trim: true },
    registrationNo: { type: String, default: '' },
    studentName: { type: String, required: true, trim: true },
    fatherName: { type: String, required: true, trim: true },
    subjects: [subject],
    obtained: { type: Number, required: true },
    total: { type: Number, required: true },
    percentage: { type: Number, required: true },
    trustLevel: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'DECLARED', index: true },
    flags: [{ type: String }],
    registryDiff: [{ _id: false, field: String, entered: Schema.Types.Mixed, official: Schema.Types.Mixed }],
    resultCardFileId: { type: Types.ObjectId, ref: 'StoredFile', default: null },
    resultCardHash: { type: String, default: '' },
    version: { type: Number, default: 1 },
    previousVersionId: { type: Types.ObjectId, ref: 'AcademicRecord', default: null },
    locked: { type: Boolean, default: false },
    current: { type: Boolean, default: true, index: true },
    verifiedBy: { type: Types.ObjectId, ref: 'User', default: null },
    verifiedAt: Date,
  },
  { timestamps: true },
);
recordSchema.index({ board: 1, level: 1, year: 1, rollNo: 1 });

export type AcademicRecord = InferSchemaType<typeof recordSchema>;
export const RecordModel = model('AcademicRecord', recordSchema);

const verificationSchema = new Schema(
  {
    recordId: { type: Types.ObjectId, ref: 'AcademicRecord', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
    method: { type: String, enum: ['REGISTRY', 'OFFICER'], required: true },
    status: { type: String, enum: ['MATCH', 'NOT_FOUND', 'MISMATCH', 'VERIFIED'], required: true },
    diff: [{ _id: false, field: String, entered: Schema.Types.Mixed, official: Schema.Types.Mixed }],
    registryRowId: { type: Types.ObjectId, default: null },
    note: { type: String, default: '' },
    decidedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
export const VerificationModel = model('MarksVerification', verificationSchema);

export const FRAUD_TYPES = ['ROLL_NUMBER_CLAIMED_TWICE', 'RESULT_CARD_REUSED', 'REPEATED_MISMATCH'] as const;

const fraudSchema = new Schema(
  {
    type: { type: String, enum: FRAUD_TYPES, required: true },
    key: { type: String, required: true, unique: true },
    userIds: [{ type: Types.ObjectId, ref: 'User' }],
    recordIds: [{ type: Types.ObjectId, ref: 'AcademicRecord' }],
    details: { type: String, default: '' },
    status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' },
  },
  { timestamps: true },
);
export const FraudFlagModel = model('FraudFlag', fraudSchema);
