import { Schema, Types, model } from 'mongoose';
import { RECORD_LEVELS } from '../../constants/academics';

const batchSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
    source: { type: String, required: true },
    fileName: { type: String, default: '' },
    fileHash: { type: String, required: true },
    uploadedBy: { type: Types.ObjectId, ref: 'User', required: true },
    rowCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    boards: [{ type: String }],
    years: [{ type: Number }],
    status: { type: String, enum: ['ACTIVE', 'ROLLED_BACK'], default: 'ACTIVE' },
    rolledBackAt: Date,
  },
  { timestamps: true },
);
export const RegistryBatchModel = model('RegistryImportBatch', batchSchema);

const rowSchema = new Schema(
  {
    batchId: { type: Types.ObjectId, ref: 'RegistryImportBatch', required: true, index: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
    board: { type: String, required: true },
    level: { type: String, enum: RECORD_LEVELS, required: true },
    year: { type: Number, required: true },
    rollNo: { type: String, required: true },
    studentName: { type: String, required: true },
    fatherName: { type: String, default: '' },
    obtained: { type: Number, required: true },
    total: { type: Number, required: true },
    subjects: [{ _id: false, name: String, obtained: Number, total: Number }],
  },
  { timestamps: true },
);
rowSchema.index({ institutionId: 1, board: 1, level: 1, year: 1, rollNo: 1 }, { unique: true });
export const RegistryRowModel = model('BoardResultRegistry', rowSchema, 'boardresultregistry');
