import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { DEGREE_LEVELS, QUALIFICATION_LEVELS, SHIFTS } from '../../constants/enums';

const programSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    departmentId: { type: Types.ObjectId, ref: 'Department', required: true },
    campusId: { type: Types.ObjectId, ref: 'Campus', required: true },
    title: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    degreeLevel: { type: String, enum: DEGREE_LEVELS, required: true },
    fieldGroup: { type: String, default: '' },
    durationYears: { type: Number, required: true, min: 1, max: 8 },
    description: { type: String, default: '' },
    shifts: [
      {
        _id: false,
        name: { type: String, enum: SHIFTS, required: true },
        seats: { type: Number, required: true, min: 1 },
      },
    ],
    eligibility: [
      {
        _id: false,
        level: { type: String, enum: QUALIFICATION_LEVELS, required: true },
        minPercentage: { type: Number, required: true, min: 0, max: 100 },
        groups: [{ type: String }],
        subjects: [{ type: String }],
      },
    ],
    testRequired: { type: Boolean, default: false },
    testName: { type: String, default: '' },
    applicationFee: { type: Number, required: true, min: 0 },
    admissionFee: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  },
  { timestamps: true },
);
// PROG-3: program codes are unique within an institution.
programSchema.index({ institutionId: 1, code: 1 }, { unique: true });
programSchema.index({ title: 'text', code: 'text' });

export type Program = InferSchemaType<typeof programSchema>;
export const ProgramModel = model('Program', programSchema);

export function totalSeats(p: { shifts?: { seats: number }[] }): number {
  return (p.shifts ?? []).reduce((s, x) => s + x.seats, 0);
}
