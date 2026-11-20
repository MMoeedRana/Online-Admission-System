import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { PROVINCES } from '../../constants/enums';

const address = {
  line: { type: String, default: '' },
  city: { type: String, default: '' },
  province: { type: String, enum: [...PROVINCES, ''], default: '' },
};

const profileSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    cnic: { type: String, required: true, unique: true, match: /^\d{13}$/ },
    fullName: { type: String, required: true, trim: true },
    fatherName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    phone: { type: String, required: true },
    nationality: { type: String, default: 'Pakistani' },
    domicile: { type: String, required: true },
    religion: { type: String, default: '' },
    guardian: {
      name: { type: String, required: true },
      relation: { type: String, required: true },
      phone: { type: String, required: true },
      occupation: { type: String, default: '' },
    },
    permanentAddress: address,
    currentAddress: address,
  },
  { timestamps: true },
);

export type Profile = InferSchemaType<typeof profileSchema>;
export const ProfileModel = model('ApplicantProfile', profileSchema);

export function formatCnic(cnic: string) {
  return cnic.length === 13 ? `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}` : cnic;
}
