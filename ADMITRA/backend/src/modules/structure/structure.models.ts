import { Schema, Types, model } from 'mongoose';

const tenant = { type: Types.ObjectId, ref: 'Institution', required: true, index: true };

const campusSchema = new Schema(
  {
    institutionId: tenant,
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    city: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    isMain: { type: Boolean, default: false },
  },
  { timestamps: true },
);
campusSchema.index({ institutionId: 1, code: 1 }, { unique: true });
export const CampusModel = model('Campus', campusSchema);

const facultySchema = new Schema(
  {
    institutionId: tenant,
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
  },
  { timestamps: true },
);
facultySchema.index({ institutionId: 1, code: 1 }, { unique: true });
export const FacultyModel = model('Faculty', facultySchema);

const departmentSchema = new Schema(
  {
    institutionId: tenant,
    facultyId: { type: Types.ObjectId, ref: 'Faculty', required: true },
    campusIds: [{ type: Types.ObjectId, ref: 'Campus' }],
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
  },
  { timestamps: true },
);
departmentSchema.index({ institutionId: 1, code: 1 }, { unique: true });
export const DepartmentModel = model('Department', departmentSchema);

const sessionSchema = new Schema(
  {
    institutionId: tenant,
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
  },
  { timestamps: true },
);
sessionSchema.index({ institutionId: 1, name: 1 }, { unique: true });
export const AcademicSessionModel = model('AcademicSession', sessionSchema);
