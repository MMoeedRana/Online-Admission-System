import { z } from 'zod';
import type { ToolSpec } from '../providers/types';
import { actionTools } from './actions';
import type { AgentContext, AgentTool } from './common';
import { readTools } from './read';

export const ALL_TOOLS: AgentTool[] = [...readTools, ...actionTools];

export function toolsFor(ctx: AgentContext) {
  return ALL_TOOLS.filter((t) => {
    if (ctx.scope === 'PLATFORM') return t.scope !== 'institution';
    if (t.scope === 'platform') return false;
    return !t.permission || ctx.permissions.includes(t.permission);
  });
}

export function toolSpec(t: AgentTool): ToolSpec {
  const schema = z.toJSONSchema(t.input, { target: 'draft-7' }) as Record<string, unknown>;
  delete schema.$schema;
  const clean = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(clean);
    if (o && typeof o === 'object') {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o))
        if (k !== 'additionalProperties' && k !== '$schema') r[k] = clean(v);
      return r;
    }
    return o;
  };
  const params = clean(schema) as Record<string, unknown>;
  if (!params.properties) params.properties = {};
  params.type = 'object';
  return {
    name: t.name,
    description: `${t.description}${t.kind === 'action' ? ' (Action: prepared for the user to confirm.)' : ''}`,
    parameters: params,
  };
}
