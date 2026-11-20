import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { escapeRegex } from '../../../lib/pagination';
import { CampaignModel } from '../../campaigns/campaign.model';
import { InstitutionModel } from '../../institutions/institution.model';
import type { AgentScope } from '../agent.models';

export interface AgentContext {
  req: Request;
  scope: AgentScope;
  userId: string;
  userName: string;
  institutionId: Types.ObjectId | null;
  institutionName: string;
  permissions: string[];
}

export interface AgentTool<I = Record<string, unknown>> {
  name: string;
  description: string;
  label: string;
  scope: 'platform' | 'institution' | 'both';
  kind: 'read' | 'action';
  permission?: string;
  input: z.ZodType<I>;
  run: (ctx: AgentContext, input: I) => Promise<unknown>;
  describe?: (ctx: AgentContext, input: I) => Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineTool = (t: AgentTool<any>) => t as unknown as AgentTool;

export const DAY = 24 * 3600_000;
export const since = (days: number) => new Date(Date.now() - days * DAY);
export const pktDay = (d: Date = new Date()) =>
  new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
export const startOfPktDay = (d: Date = new Date()) => new Date(`${pktDay(d)}T00:00:00+05:00`);

export const maskCnic = (cnic?: string | null) =>
  cnic ? `*********${String(cnic).replace(/\D/g, '').slice(-4)}` : '';

export class ToolError extends Error {}

export async function resolveInstitution(ctx: AgentContext, ref?: string | null) {
  if (ctx.scope === 'INSTITUTION') return InstitutionModel.findById(ctx.institutionId).lean();
  if (!ref) return null;
  if (Types.ObjectId.isValid(ref)) {
    const byId = await InstitutionModel.findById(ref).lean();
    if (byId) return byId;
  }
  const rx = new RegExp(`^${escapeRegex(ref.trim())}`, 'i');
  const found = await InstitutionModel.find({ $or: [{ shortName: rx }, { name: rx }, { slug: rx }] })
    .limit(2)
    .lean();
  if (!found.length) {
    const loose = await InstitutionModel.find({ name: new RegExp(escapeRegex(ref.trim()), 'i') })
      .limit(2)
      .lean();
    if (loose.length === 1) return loose[0];
    throw new ToolError(`No institution matches "${ref}".`);
  }
  return found[0];
}

export async function tenantFilter(
  ctx: AgentContext,
  institution?: string | null,
): Promise<Record<string, unknown>> {
  if (ctx.scope === 'INSTITUTION') return { institutionId: ctx.institutionId };
  if (!institution) return {};
  const i = await resolveInstitution(ctx, institution);
  return i ? { institutionId: i._id } : {};
}

export async function resolveCampaign(filter: Record<string, unknown>, ref?: string | null) {
  if (ref) {
    const rx = new RegExp(escapeRegex(ref.trim()), 'i');
    const c = await CampaignModel.findOne({ ...filter, $or: [{ code: rx }, { title: rx }] })
      .sort({ opensAt: -1 })
      .lean();
    if (c) return c;
  }
  return CampaignModel.findOne(filter).sort({ status: 1, opensAt: -1 }).lean();
}

export const institutionArg = z
  .string()
  .max(120)
  .optional()
  .describe('Institution name, short name or id (platform only; ignored inside an institution workspace)');
