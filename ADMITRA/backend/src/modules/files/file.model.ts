import { Schema, Types, model, type InferSchemaType } from 'mongoose';

export const FILE_PURPOSES = ['DOCUMENT', 'RESULT_CARD', 'PAYMENT_PROOF'] as const;

const fileSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: FILE_PURPOSES, required: true },
    storageKey: { type: String, required: true, unique: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

export type StoredFile = InferSchemaType<typeof fileSchema>;
export const FileModel = model('StoredFile', fileSchema);
