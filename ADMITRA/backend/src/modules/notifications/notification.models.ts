import { Schema, Types, model } from 'mongoose';

const notificationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
export const NotificationModel = model('Notification', notificationSchema);

const templateSchema = new Schema(
  {
    institutionId: { type: Types.ObjectId, ref: 'Institution', required: true },
    key: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true },
);
templateSchema.index({ institutionId: 1, key: 1 }, { unique: true });
export const EmailTemplateModel = model('EmailTemplate', templateSchema);
