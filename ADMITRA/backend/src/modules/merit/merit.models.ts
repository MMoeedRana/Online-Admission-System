import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { SHIFTS } from '../../constants/enums';
import { MERIT_COMPONENTS, TIE_BREAKERS } from '../../lib/merit';

const formulaSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true },
    programId: { type: Types.ObjectId, ref: 'Program', required: true },
    version: { type: Number, required: true },
    components: [
      {
        _id: false,
        type: { type: String, enum: MERIT_COMPONENTS, required: true },
        testName: { type: String, default: '' },
        weight: { type: Number, required: true, min: 0, max: 100 },
        minPercentage: { type: Number, default: null, min: 0, max: 100 },
        required: { type: Boolean, default: true },
      },
    ],
    tieBreakers: [{ type: String, enum: TIE_BREAKERS }],
    note: { type: String, default: '' },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'RETIRED'], default: 'DRAFT', index: true },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
    activatedBy: { type: Types.ObjectId, ref: 'User' },
    activatedAt: Date,
  },
  { timestamps: true },
);
formulaSchema.index({ campaignId: 1, programId: 1, version: 1 }, { unique: true });
export type MeritFormula = InferSchemaType<typeof formulaSchema>;
export const MeritFormulaModel = model('MeritFormula', formulaSchema);

export const LIST_STATUSES = ['DRAFT', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED'] as const;

const listSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true, index: true },
    listNumber: { type: Number, required: true },
    revision: { type: Number, default: 1 },
    supersedesId: { type: Types.ObjectId, ref: 'MeritList', default: null },
    status: { type: String, enum: LIST_STATUSES, default: 'DRAFT', index: true },
    offerDeadline: { type: Date, required: true },
    formulas: [
      {
        _id: false,
        programId: { type: Types.ObjectId, ref: 'Program' },
        formulaId: { type: Types.ObjectId, ref: 'MeritFormula' },
        version: Number,
      },
    ],
    pools: [
      {
        _id: false,
        programId: { type: Types.ObjectId, ref: 'Program', required: true },
        programTitle: String,
        programCode: String,
        shift: { type: String, enum: SHIFTS, required: true },
        capacity: Number,
        seats: Number,
        selected: { type: Number, default: 0 },
        waitlisted: { type: Number, default: 0 },
        openingAggregate: { type: Number, default: null },
        closingAggregate: { type: Number, default: null },
      },
    ],
    excluded: [
      {
        _id: false,
        applicationId: { type: Types.ObjectId, ref: 'Application' },
        applicationNumber: String,
        name: String,
        reason: String,
      },
    ],
    counts: {
      candidates: { type: Number, default: 0 },
      selected: { type: Number, default: 0 },
      waitlisted: { type: Number, default: 0 },
      notSelected: { type: Number, default: 0 },
      excluded: { type: Number, default: 0 },
    },
    generatedBy: { type: Types.ObjectId, ref: 'User', required: true },
    generatedByName: String,
    approvedBy: { type: Types.ObjectId, ref: 'User' },
    approvedByName: String,
    approvedAt: Date,
    publishedBy: { type: Types.ObjectId, ref: 'User' },
    publishedByName: String,
    publishedAt: Date,
    discardReason: { type: String, default: '' },
  },
  { timestamps: true },
);
listSchema.index({ campaignId: 1, listNumber: 1, revision: 1 }, { unique: true });
export type MeritList = InferSchemaType<typeof listSchema>;
export const MeritListModel = model('MeritList', listSchema);

const entrySchema = new Schema(
  {
    meritListId: { type: Types.ObjectId, ref: 'MeritList', required: true, index: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true },
    applicationId: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    applicantId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    applicationNumber: { type: String, required: true },
    shortName: { type: String, required: true },
    programId: { type: Types.ObjectId, ref: 'Program', required: true },
    shift: { type: String, enum: SHIFTS, required: true },
    preferenceOrder: Number,
    aggregate: { type: Number, required: true },
    breakdown: [
      {
        _id: false,
        component: String,
        label: String,
        percentage: Number,
        weight: Number,
        contribution: Number,
        note: String,
      },
    ],
    meritPosition: { type: Number, required: true },
    outcome: { type: String, enum: ['SELECTED', 'WAITLISTED', 'NOT_SELECTED'], required: true },
    waitingPosition: { type: Number, default: null },
  },
  { timestamps: true },
);
entrySchema.index({ meritListId: 1, programId: 1, shift: 1, meritPosition: 1 });
export type MeritListEntry = InferSchemaType<typeof entrySchema>;
export const MeritEntryModel = model('MeritListEntry', entrySchema);

export const OFFER_STATUSES = [
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'ENROLLED',
  'REVOKED',
  'CANCELLED',
] as const;

const offerSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true, index: true },
    meritListId: { type: Types.ObjectId, ref: 'MeritList', required: true },
    entryId: { type: Types.ObjectId, ref: 'MeritListEntry', required: true },
    applicationId: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    applicantId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    programId: { type: Types.ObjectId, ref: 'Program', required: true },
    shift: { type: String, enum: SHIFTS, required: true },
    meritPosition: Number,
    aggregate: Number,
    deadline: { type: Date, required: true, index: true },
    status: { type: String, enum: OFFER_STATUSES, default: 'OFFERED', index: true },
    respondedAt: Date,
    voucherId: { type: Types.ObjectId, ref: 'FeeVoucher', default: null },
    reason: { type: String, default: '' },
  },
  { timestamps: true },
);
export type AdmissionOffer = InferSchemaType<typeof offerSchema>;
export const OfferModel = model('AdmissionOffer', offerSchema);

const enrollmentSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true },
    offerId: { type: Types.ObjectId, ref: 'AdmissionOffer', required: true, unique: true },
    applicationId: { type: Types.ObjectId, ref: 'Application', required: true },
    applicantId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    programId: { type: Types.ObjectId, ref: 'Program', required: true },
    shift: { type: String, enum: SHIFTS, required: true },
    registrationNumber: { type: String, default: null },
    status: { type: String, enum: ['PENDING_ORIGINALS', 'ENROLLED', 'REVOKED'], required: true },
    originalsVerified: { type: Boolean, default: false },
    originalsVerifiedBy: { type: Types.ObjectId, ref: 'User' },
    originalsVerifiedAt: Date,
    enrolledAt: Date,
    revokedAt: Date,
    revokeReason: { type: String, default: '' },
  },
  { timestamps: true },
);
enrollmentSchema.index(
  { registrationNumber: 1 },
  { unique: true, partialFilterExpression: { registrationNumber: { $type: 'string' } } },
);
export type Enrollment = InferSchemaType<typeof enrollmentSchema>;
export const EnrollmentModel = model('Enrollment', enrollmentSchema);

const blockSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true },
    campaignId: { type: Types.ObjectId, ref: 'AdmissionCampaign', required: true },
    cnic: { type: String, required: true },
    reason: { type: String, required: true },
    by: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
blockSchema.index({ campaignId: 1, cnic: 1 }, { unique: true });
export const CnicBlockModel = model('CnicBlock', blockSchema);
