import { env } from '../../../config/env';
import { AnthropicProvider } from './anthropic';
import { OpenAICompatibleProvider } from './openai';
import type { ChatProvider } from './types';

/** Default model of each provider; AI_MODEL overrides it. */
export const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-5-5',
  'openai-compatible': '',
};

const BASE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
};

let override: ChatProvider | null = null;

/** Tests (and a future admin screen) can replace the provider. */
export function setProvider(p: ChatProvider | null) {
  override = p;
}

export function aiStatus() {
  const configured = Boolean(override) || (env.AI_PROVIDER !== 'none' && Boolean(env.AI_API_KEY));
  return {
    configured,
    provider: override?.name ?? env.AI_PROVIDER,
    model: override?.model ?? (env.AI_MODEL || DEFAULT_MODELS[env.AI_PROVIDER] || ''),
  };
}

/** The provider chosen by AI_PROVIDER / AI_API_KEY / AI_MODEL / AI_BASE_URL, or null when none is set. */
export function getProvider(): ChatProvider | null {
  if (override) return override;
  if (env.AI_PROVIDER === 'none' || !env.AI_API_KEY) return null;
  const model = env.AI_MODEL || DEFAULT_MODELS[env.AI_PROVIDER] || '';
  if (env.AI_PROVIDER === 'anthropic')
    return new AnthropicProvider(env.AI_API_KEY, model, env.AI_BASE_URL || 'https://api.anthropic.com');
  const base = env.AI_BASE_URL || BASE_URLS[env.AI_PROVIDER] || '';
  if (!base || !model) return null;
  return new OpenAICompatibleProvider(env.AI_PROVIDER, base, env.AI_API_KEY, model);
}
