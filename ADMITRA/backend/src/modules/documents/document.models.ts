import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { DOCUMENT_FORMATS } from '../../constants/applications';
import { DEGREE_LEVELS } from '../../constants/enums';
import type { Id } from '../../lib/types';

/** DOC-1: documents required by an institution. */
const typeSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, default: '' },
    formats: [{ type: String, enum: DOCUMENT_FORMATS }],
    maxSizeMB: { type: Number, default: 2, min: 0.1, max: 10 },
    required: { type: Boolean, default: true },
    degreeLevels: [{ type: String, enum: DEGREE_LEVELS }],
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
typeSchema.index({ institutionId: 1, code: 1 }, { unique: true });
export type DocumentType = InferSchemaType<typeof typeSchema>;
export const DocumentTypeModel = model('DocumentType', typeSchema);

/** DOC-4: every upload version and review decision is kept. */
const docSchema = new Schema(
  {
    applicationId: { type: Types.ObjectId, ref: 'Application', required: true, index: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true },
    documentTypeId: { type: Types.ObjectId, ref: 'DocumentType', required: true },
    fileId: { type: Types.ObjectId, ref: 'StoredFile', required: true },
    version: { type: Number, default: 1 },
    current: { type: Boolean, default: true },
    status: { type: String, enum: ['UPLOADED', 'APPROVED', 'REJECTED'], default: 'UPLOADED' },
    reviewTrail: [
      {
        _id: false,
        decision: { type: String, enum: ['APPROVED', 'REJECTED'] },
        reason: String,
        reviewer: { type: Types.ObjectId, ref: 'User' },
        reviewerName: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
export const ApplicantDocumentModel = model('ApplicantDocument', docSchema);

/** Default document requirements created for every institution. */
export const DEFAULT_DOCUMENT_TYPES = [
  {
    code: 'CNIC',
    name: 'CNIC / B-Form',
    description: 'Both sides of your CNIC, or your B-Form if you are under 18.',
    formats: ['PDF', 'JPG', 'PNG'],
    maxSizeMB: 2,
    required: true,
    order: 1,
  },
  {
    code: 'PHOTO',
    name: 'Passport-size photograph',
    description: 'Recent photograph with a blue or white background.',
    formats: ['JPG', 'PNG'],
    maxSizeMB: 1,
    required: true,
    order: 2,
  },
  {
    code: 'MATRIC',
    name: 'Matric result card (DMC)',
    description: 'Detailed marks certificate of Matric / O-Level.',
    formats: ['PDF', 'JPG', 'PNG'],
    maxSizeMB: 2,
    required: true,
    order: 3,
  },
  {
    code: 'INTER',
    name: 'Intermediate result card (DMC)',
    description: 'Detailed marks certificate of Intermediate / A-Level.',
    formats: ['PDF', 'JPG', 'PNG'],
    maxSizeMB: 2,
    required: true,
    degreeLevels: ['ASSOCIATE', 'BS'],
    order: 4,
  },
  {
    code: 'DOMICILE',
    name: 'Domicile certificate',
    description: 'Domicile issued by the district government.',
    formats: ['PDF', 'JPG', 'PNG'],
    maxSizeMB: 2,
    required: false,
    order: 5,
  },
];

/** Creates the default document requirements for a new institution (they can be changed later). */
export async function ensureDefaultDocumentTypes(institutionId: Id) {
  if (await DocumentTypeModel.exists({ institutionId })) return;
  await DocumentTypeModel.insertMany(DEFAULT_DOCUMENT_TYPES.map((d) => ({ ...d, institutionId })));
}
