import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { STAFF_ROLES } from '../../constants/roles';

const memberSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    fullName: { type: String, default: '' },
    designation: { type: String, default: '' },
    roles: [{ type: String, enum: STAFF_ROLES }],
    departmentIds: [{ type: Types.ObjectId, ref: 'Department' }],
    status: { type: String, enum: ['INVITED', 'ACTIVE', 'DISABLED'], default: 'INVITED' },
    invitedBy: { type: Types.ObjectId, ref: 'User' },
    joinedAt: Date,
  },
  { timestamps: true },
);
memberSchema.index({ institutionId: 1, email: 1 }, { unique: true });

export type Member = InferSchemaType<typeof memberSchema>;
export const MemberModel = model('InstitutionMember', memberSchema);
