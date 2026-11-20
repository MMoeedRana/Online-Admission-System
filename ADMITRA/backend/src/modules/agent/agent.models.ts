import { Schema, Types, model } from 'mongoose';

export const AGENT_SCOPES = ['PLATFORM', 'INSTITUTION'] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

const messageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'tool'], required: true },
    content: { type: String, default: '' },
    toolCalls: [{ _id: false, id: String, name: String, args: Schema.Types.Mixed }],
    toolCallId: { type: String, default: '' },
    name: { type: String, default: '' },
    actionId: { type: Types.ObjectId, default: null },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } },
);
const conversationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, enum: AGENT_SCOPES, required: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
    title: { type: String, default: 'New conversation', maxlength: 120 },
    messages: [messageSchema],
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
conversationSchema.index({ userId: 1, scope: 1, institutionId: 1, lastMessageAt: -1 });
export const ConversationModel = model('AgentConversation', conversationSchema);

const actionSchema = new Schema(
  {
    conversationId: { type: Types.ObjectId, ref: 'AgentConversation', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, enum: AGENT_SCOPES, required: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
    tool: { type: String, required: true },
    input: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'DONE', 'CANCELLED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    result: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export const AgentActionModel = model('AgentAction', actionSchema);

const alertSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    code: { type: String, required: true, index: true },
    severity: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], required: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null, index: true },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    evidence: [{ type: String }],
    count: { type: Number, default: 1 },
    status: { type: String, enum: ['OPEN', 'REVIEWED', 'DISMISSED'], default: 'OPEN', index: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    reviewedBy: { type: Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);
export const IntegrityAlertModel = model('IntegrityAlert', alertSchema);

const briefingSchema = new Schema(
  {
    scope: { type: String, enum: AGENT_SCOPES, required: true },
    institutionId: { type: Types.ObjectId, ref: 'Institution', default: null },
    date: { type: String, required: true },
    figures: { type: Schema.Types.Mixed, default: {} },
    highlights: [{ type: String }],
    summary: { type: String, default: '' },
    generatedBy: { type: String, enum: ['AI', 'TEMPLATE'], default: 'TEMPLATE' },
  },
  { timestamps: true },
);
briefingSchema.index({ scope: 1, institutionId: 1, date: -1 }, { unique: true });
export const BriefingModel = model('Briefing', briefingSchema);

const usageSchema = new Schema({
  userId: { type: Types.ObjectId, required: true },
  date: { type: String, required: true },
  messages: { type: Number, default: 0 },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
});
usageSchema.index({ userId: 1, date: 1 }, { unique: true });
export const AgentUsageModel = model('AgentUsage', usageSchema);
