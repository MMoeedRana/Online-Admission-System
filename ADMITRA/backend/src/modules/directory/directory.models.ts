import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import {
  DEGREE_LEVELS,
  INSTITUTION_TYPES,
  PROVINCES,
  QUALIFICATION_LEVELS,
  SECTORS,
  SHIFTS,
} from '../../constants/enums';
import { MERIT_COMPONENTS } from '../../lib/merit';

/** DIR-1: institutions of the reference directory (on ADMITRA or not). */
const dirInstitutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, default: '', trim: true },
    slug: { type: String, required: true, unique: true },
    type: { type: String, enum: INSTITUTION_TYPES, required: true },
    sector: { type: String, enum: SECTORS, required: true },
    city: { type: String, required: true },
    province: { type: String, enum: PROVINCES, required: true },
    website: { type: String, default: '' },
    about: { type: String, default: '' },
    campuses: [{ _id: false, name: String, city: String }],
    /** Set when the institution uses ADMITRA (its data then comes from published merit lists). */
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null, index: true },
    /** DIR-7: an institution can claim its profile; the super admin approves the claim. */
    claim: {
      institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
      institutionName: { type: String, default: '' },
      note: { type: String, default: '' },
      status: { type: String, enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NONE' },
      at: Date,
    },
    status: { type: String, enum: ['ACTIVE', 'HIDDEN'], default: 'ACTIVE' },
  },
  { timestamps: true },
);
dirInstitutionSchema.index({ name: 'text', city: 'text' });
export type DirectoryInstitution = InferSchemaType<typeof dirInstitutionSchema>;
export const DirInstitutionModel = model('DirectoryInstitution', dirInstitutionSchema);

/** DIR-1: programs with fee, seats, eligibility, formula weights and usual admission months. */
const dirProgramSchema = new Schema(
  {
    directoryInstitutionId: {
      type: Types.ObjectId,
      ref: 'DirectoryInstitution',
      required: true,
      index: true,
    },
    programId: { type: Types.ObjectId, ref: 'Program', default: null, index: true },
    title: { type: String, required: true, trim: true },
    degreeLevel: { type: String, enum: DEGREE_LEVELS, required: true },
    fieldGroup: { type: String, default: '' },
    durationYears: { type: Number, default: 4 },
    /** Approximate fee per semester in rupees. */
    feePerSemester: { type: Number, default: 0 },
    shifts: [{ type: String, enum: SHIFTS }],
    seats: { type: Number, default: 0 },
    eligibility: [
      {
        _id: false,
        level: { type: String, enum: QUALIFICATION_LEVELS },
        minPercentage: Number,
        groups: [String],
      },
    ],
    formula: [{ _id: false, component: { type: String, enum: MERIT_COMPONENTS }, weight: Number }],
    testName: { type: String, default: '' },
    admissionMonths: [{ type: Number, min: 1, max: 12 }],
    applyUrl: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'HIDDEN'], default: 'ACTIVE' },
  },
  { timestamps: true },
);
dirProgramSchema.index({ title: 'text' });
export type DirectoryProgram = InferSchemaType<typeof dirProgramSchema>;
export const DirProgramModel = model('DirectoryProgram', dirProgramSchema);

/** DIR-2 to DIR-5: closing merit per year, round, shift and quota with its source. */
const historySchema = new Schema(
  {
    directoryProgramId: { type: Types.ObjectId, ref: 'DirectoryProgram', required: true, index: true },
    year: { type: Number, required: true },
    round: { type: Number, default: 1, min: 1 },
    shift: { type: String, enum: SHIFTS, default: 'MORNING' },
    quota: { type: String, default: 'OPEN' },
    openingMerit: { type: Number, default: null },
    closingMerit: { type: Number, required: true },
    seats: { type: Number, default: null },
    source: { type: String, required: true },
    sourceUrl: { type: String, default: '' },
    origin: { type: String, enum: ['MANUAL', 'IMPORT', 'ADMITRA'], required: true },
    status: { type: String, enum: ['DRAFT', 'VERIFIED', 'REJECTED'], default: 'DRAFT', index: true },
    enteredBy: { type: Types.ObjectId, ref: 'User', default: null },
    enteredByName: { type: String, default: '' },
    verifiedBy: { type: Types.ObjectId, ref: 'User', default: null },
    verifiedAt: Date,
    rejectReason: { type: String, default: '' },
  },
  { timestamps: true },
);
historySchema.index({ directoryProgramId: 1, year: 1, round: 1, shift: 1, quota: 1 }, { unique: true });
export type MeritHistory = InferSchemaType<typeof historySchema>;
export const MeritHistoryModel = model('MeritHistory', historySchema);

/** PRED-10: programs saved by a signed-in applicant. */
const shortlistSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    directoryProgramId: { type: Types.ObjectId, ref: 'DirectoryProgram', required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);
shortlistSchema.index({ userId: 1, directoryProgramId: 1 }, { unique: true });
export const ShortlistModel = model('Shortlist', shortlistSchema);

/** PRED-12: anonymous advisor usage (rounded inputs, no identity). */
const advisorLogSchema = new Schema(
  {
    inputs: {
      matric: Number,
      inter: Number,
      test: { type: Number, default: null },
      fieldGroup: String,
      degreeLevel: String,
      city: String,
      province: String,
      sector: String,
    },
    resultCount: Number,
    programs: [{ _id: false, directoryProgramId: Types.ObjectId, band: String }],
    signedIn: Boolean,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const AdvisorLogModel = model('AdvisorLog', advisorLogSchema);
