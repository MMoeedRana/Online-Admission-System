import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { brand } from '../../lib/brand';
import { ApiError } from '../../lib/http';
import { logger } from '../../lib/logger';
import { planOf } from '../institutions/limits';
import { AgentActionModel, AgentUsageModel, ConversationModel, type AgentScope } from './agent.models';
import { aiStatus, getProvider } from './providers';
import { ProviderError, type ChatMessage } from './providers/types';
import { pktDay, ToolError, type AgentContext } from './tools/common';
import { ALL_TOOLS, toolSpec, toolsFor } from './tools';

export const MAX_STEPS = 6;
const MAX_TOOL_RESULT = 12_000;
const HISTORY = 30;

export async function contextFor(req: Request, scope: AgentScope): Promise<AgentContext> {
  if (scope === 'PLATFORM') {
    if (req.auth?.platformRole !== 'SUPER_ADMIN') throw ApiError.forbidden();
    return {
      req,
      scope,
      userId: req.auth.userId,
      userName: req.auth.name,
      institutionId: null,
      institutionName: '',
      permissions: [],
    };
  }
  const t = req.tenant!;
  if (!t.permissions.includes(PERMISSIONS.AI_COPILOT)) throw ApiError.forbidden();
  const plan = await planOf(t.institution);
  if (!plan.features?.aiCopilot)
    throw new ApiError(
      403,
      'PLAN_FEATURE',
      `The ${brand().agentName} assistant is not included in the ${plan.name} plan.`,
    );
  return {
    req,
    scope,
    userId: req.auth!.userId,
    userName: req.auth!.name,
    institutionId: new Types.ObjectId(String(t.institutionId)),
    institutionName: t.institution.name,
    permissions: t.permissions,
  };
}

function systemPrompt(ctx: AgentContext) {
  const b = brand();
  const now = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const who =
    ctx.scope === 'PLATFORM'
      ? `You assist ${ctx.userName}, the Super Admin of the ${b.platformName} platform. You can see every institution, subscription, platform fee, application, payment, ticket and audit entry.`
      : `You assist ${ctx.userName}, an admin of ${ctx.institutionName} on ${b.platformName}. You only see data of ${ctx.institutionName}; never claim to know about other institutions.`;
  return [
    `You are ${b.agentName}, the admission operations copilot of ${b.platformName}, an online admission platform for colleges and universities in Pakistan.`,
    who,
    `Current date and time in Pakistan: ${now}. Money is in Pakistani rupees (Rs.).`,
    'Rules:',
    '- Always get facts from the tools; never invent figures, names or records. If a tool returns nothing, say so.',
    '- Call several tools when a question needs them (for example overview + payments + alerts for "is everything fine today?").',
    '- Integrity findings are patterns that need a human review, not proof of wrongdoing. Describe them neutrally with their evidence and suggest what to check.',
    '- Actions (reminders, replies, closing alerts, opening tickets) are only prepared; tell the user to press Confirm on the card. Never say an action is done before it is confirmed.',
    '- Never reveal full CNIC numbers, passwords, tokens or file contents.',
    "- Personality: warm, friendly, polite and professional, like a helpful colleague. Use the user's first name now and then.",
    '- Greetings and small talk ("hi", "hello", "salam", "how are you", "kaise ho", "thanks", "shukriya", "bye") need no tools: answer naturally in one or two friendly sentences and offer help with admissions, payments, seats, fees or alerts.',
    '- Language: if the user writes in Roman Urdu (Urdu in Latin letters, e.g. "aaj kitni applications aayi hain?"), reply in natural Roman Urdu; if the user writes in Urdu script, reply in Urdu; otherwise reply in English. Keep figures, names and table headings exact.',
    '- If a question is outside admission operations, say politely what you can help with instead.',
    '- Be concise: lead with the answer, then short bullet points or a small markdown table. Use the exact figures from the tools.',
  ].join('\n');
}

function toWire(m: {
  role: string;
  content: string;
  toolCalls?: { id: string; name: string; args: unknown }[];
  toolCallId?: string;
  name?: string;
}): ChatMessage {
  if (m.role === 'tool')
    return { role: 'tool', toolCallId: m.toolCallId ?? '', name: m.name ?? '', content: m.content };
  if (m.role === 'assistant')
    return {
      role: 'assistant',
      content: m.content,
      toolCalls: (m.toolCalls ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        args: (t.args ?? {}) as Record<string, unknown>,
      })),
    };
  return { role: 'user', content: m.content };
}

async function useQuota(userId: string, tokens = { input: 0, output: 0 }, count = 0) {
  const date = pktDay();
  const u = await AgentUsageModel.findOneAndUpdate(
    { userId, date },
    { $inc: { messages: count, inputTokens: tokens.input, outputTokens: tokens.output } },
    { upsert: true, returnDocument: 'after' },
  );
  return u!;
}

export async function usageToday(userId: string) {
  const u = await AgentUsageModel.findOne({ userId, date: pktDay() }).lean();
  return { messages: u?.messages ?? 0, limit: env.AI_DAILY_LIMIT };
}

export type AgentEvent =
  | { type: 'tool'; name: string; label: string }
  | { type: 'action'; action: { _id: string; summary: string; tool: string; status: string } }
  | { type: 'message'; message: { _id: string; content: string; createdAt: Date } }
  | { type: 'error'; message: string };

export async function runTurn(
  ctx: AgentContext,
  conversationId: string,
  text: string,
  emit: (e: AgentEvent) => void = () => {},
) {
  const conv = await ConversationModel.findOne({
    _id: conversationId,
    userId: ctx.userId,
    scope: ctx.scope,
    institutionId: ctx.institutionId,
  });
  if (!conv) throw ApiError.notFound('Conversation');
  const used = await usageToday(ctx.userId);
  if (used.messages >= used.limit)
    throw new ApiError(
      429,
      'AI_LIMIT',
      `You have used today's ${used.limit} messages. The limit resets at midnight.`,
    );

  conv.messages.push({ role: 'user', content: text });
  if (conv.messages.filter((m) => m.role === 'user').length === 1) conv.title = text.slice(0, 80);
  conv.lastMessageAt = new Date();
  await conv.save();
  await useQuota(ctx.userId, undefined, 1);

  const provider = getProvider();
  const finish = async (content: string) => {
    conv.messages.push({ role: 'assistant', content });
    conv.lastMessageAt = new Date();
    await conv.save();
    const last = conv.messages.at(-1)!;
    emit({
      type: 'message',
      message: {
        _id: String(last._id),
        content,
        createdAt: (last as unknown as { createdAt: Date }).createdAt ?? new Date(),
      },
    });
    return last;
  };
  if (!provider) {
    const s = aiStatus();
    return finish(
      ctx.scope === 'PLATFORM'
        ? `${brand().agentName} is not connected to an AI provider yet. Set AI_PROVIDER, AI_API_KEY and (optionally) AI_MODEL in the backend .env file and restart the API (current provider: ${s.provider}). The briefings and integrity alerts work without it.`
        : `${brand().agentName} is not available right now. Please ask ${brand().platformName} support to connect the AI service.`,
    );
  }

  const tools = toolsFor(ctx);
  const specs = tools.map(toolSpec);
  for (let step = 0; step < MAX_STEPS; step++) {
    const history = conv.messages.slice(-HISTORY);
    while (history.length && history[0]!.role === 'tool') history.shift();
    let result;
    try {
      result = await provider.chat({
        messages: [{ role: 'system', content: systemPrompt(ctx) }, ...history.map((m) => toWire(m as never))],
        tools: specs,
      });
    } catch (err) {
      logger.warn({ err }, 'AI provider error');
      const busy = err instanceof ProviderError && err.status === 429;
      return finish(
        busy
          ? 'The AI service is busy right now (its rate limit was reached). Please try again in a minute.'
          : 'I could not reach the AI service. Please try again in a moment.',
      );
    }
    await useQuota(ctx.userId, { input: result.usage.inputTokens, output: result.usage.outputTokens });
    if (!result.toolCalls.length) return finish(result.content || '…');

    conv.messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });
    for (const call of result.toolCalls) {
      const tool = tools.find((t) => t.name === call.name);
      let output: unknown;
      let actionId: Types.ObjectId | null = null;
      if (!tool) output = { error: `Unknown or not allowed tool ${call.name}.` };
      else {
        emit({ type: 'tool', name: tool.name, label: tool.label });
        const parsed = tool.input.safeParse(call.args ?? {});
        if (!parsed.success)
          output = { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
        else
          try {
            if (tool.kind === 'action') {
              const summary = await tool.describe!(ctx, parsed.data);
              const action = await AgentActionModel.create({
                conversationId: conv._id,
                userId: ctx.userId,
                scope: ctx.scope,
                institutionId: ctx.institutionId,
                tool: tool.name,
                input: parsed.data,
                summary,
              });
              actionId = action._id;
              emit({
                type: 'action',
                action: { _id: String(action._id), summary, tool: tool.name, status: 'PENDING' },
              });
              output = {
                status: 'awaiting_confirmation',
                summary,
                note: 'The user must press Confirm on the card before this happens.',
              };
            } else output = await tool.run(ctx, parsed.data);
          } catch (err) {
            output = {
              error: err instanceof ToolError || err instanceof ApiError ? err.message : 'The tool failed.',
            };
            if (!(err instanceof ToolError || err instanceof ApiError))
              logger.error({ err, tool: call.name }, 'Agent tool failed');
          }
      }
      let content = JSON.stringify(output);
      if (content.length > MAX_TOOL_RESULT) content = `${content.slice(0, MAX_TOOL_RESULT)}… (truncated)`;
      conv.messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content, actionId });
    }
    await conv.save();
  }
  return finish('I needed too many steps for this question. Please ask it in smaller parts.');
}

export async function decideAction(ctx: AgentContext, actionId: string, confirm: boolean) {
  const action = await AgentActionModel.findOne({
    _id: actionId,
    userId: ctx.userId,
    scope: ctx.scope,
    institutionId: ctx.institutionId,
  });
  if (!action) throw ApiError.notFound('Action');
  if (action.status !== 'PENDING') throw ApiError.conflict('This action was already decided.');
  const tool = ALL_TOOLS.find((t) => t.name === action.tool);
  const allowed = tool && toolsFor(ctx).includes(tool);
  let text: string;
  if (!confirm) {
    action.status = 'CANCELLED';
    text = `Cancelled: ${action.summary}`;
  } else if (!allowed) {
    action.status = 'FAILED';
    action.result = 'You may not run this action.';
    text = action.result;
  } else {
    try {
      const out = await tool.run(ctx, action.input);
      action.status = 'DONE';
      action.result = JSON.stringify(out);
      text = `Done: ${action.summary}`;
      await audit(
        ctx.req,
        'AGENT_ACTION_CONFIRMED',
        'AgentAction',
        action._id,
        { tool: action.tool, input: action.input },
        { institutionId: ctx.institutionId },
      );
    } catch (err) {
      action.status = 'FAILED';
      action.result = err instanceof Error ? err.message : 'Failed';
      text = `Could not complete: ${action.result}`;
    }
  }
  action.decidedAt = new Date();
  await action.save();
  await ConversationModel.updateOne(
    { _id: action.conversationId },
    {
      $push: { messages: { role: 'assistant', content: text, actionId: action._id } },
      $set: { lastMessageAt: new Date() },
    },
  );
  return action;
}
