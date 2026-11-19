import { Schema, Types, model } from 'mongoose';

const auditSchema = new Schema(
  {
    actorId: { type: Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null, index: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: '' },
    changes: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });
export const AuditLogModel = model('AuditLog', auditSchema);
