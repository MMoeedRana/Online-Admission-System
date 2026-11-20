export type Scope = 'platform' | 'institution';
export const base = (s: Scope) => (s === 'platform' ? '/platform/agent' : '/agent');
export const pageBase = (s: Scope) => (s === 'platform' ? '/platform/mitra' : '/institution/mitra');

export interface AgentStatus {
  agentName: string;
  configured: boolean;
  provider?: string;
  model?: string;
  available: boolean;
  reason: string;
  usage: { messages: number; limit: number };
  suggestions: string[];
}
export interface ConversationSummary {
  _id: string;
  title: string;
  lastMessageAt: string;
}
export interface AgentAction {
  _id: string;
  tool: string;
  summary: string;
  status: 'PENDING' | 'DONE' | 'CANCELLED' | 'FAILED';
  result?: string;
}
export interface ChatMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  actionId?: string | null;
  createdAt?: string;
}
export interface Conversation {
  _id: string;
  title: string;
  messages: ChatMessage[];
  steps: { name: string; actionId?: string | null }[];
  actions: AgentAction[];
}
export interface Alert {
  _id: string;
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  institution: string | null;
  title: string;
  detail: string;
  evidence: string[];
  status: 'OPEN' | 'REVIEWED' | 'DISMISSED';
  firstSeenAt: string;
  lastSeenAt: string;
  reviewedByName?: string;
  note?: string;
}
export interface Briefing {
  _id: string;
  date: string;
  highlights: string[];
  summary: string;
  generatedBy: 'AI' | 'TEMPLATE';
  updatedAt: string;
}
export type StreamEvent =
  | { type: 'tool'; name: string; label: string }
  | { type: 'action'; action: AgentAction }
  | { type: 'message'; message: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'done' };
