'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, MessageSquarePlus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Avatar } from '@/components/layout/user-menu';
import { useAuth } from '@/features/auth/auth-context';
import { useBrand } from '@/features/branding/brand-context';
import { del, errorMessage, get, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { streamMessage } from './stream';
import {
  base,
  type AgentAction,
  type AgentStatus,
  type Conversation,
  type ConversationSummary,
  type Scope,
} from './types';

export function MitraAvatar({ className = 'size-9' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-violet-600 text-white shadow-[0_4px_12px_var(--ring)]',
        className,
      )}
    >
      <Sparkles className="size-[45%]" />
    </span>
  );
}

function ActionCard({ action, scope, onDone }: { action: AgentAction; scope: Scope; onDone: () => void }) {
  const decide = useMutation({
    mutationFn: (d: 'confirm' | 'cancel') => post<AgentAction>(`${base(scope)}/actions/${action._id}/${d}`),
    onSuccess: (a) => {
      if (a.status === 'DONE') toast.success('Done.');
      else if (a.status === 'FAILED') toast.error(a.result || 'The action failed.');
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const tone = { PENDING: 'amber', DONE: 'green', CANCELLED: 'gray', FAILED: 'red' } as const;
  const label = { PENDING: 'Waiting for your confirmation', DONE: 'Done', CANCELLED: 'Cancelled', FAILED: 'Failed' };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-line bg-card mt-2 rounded-2xl border p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-[11.5px] font-semibold tracking-wide uppercase">Prepared action</p>
        <Badge tone={tone[action.status]}>{label[action.status]}</Badge>
      </div>
      <p className="text-ink mt-1.5 text-[14px]">{action.summary}</p>
      {action.status === 'PENDING' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Check className="size-4" />}
            loading={decide.isPending && decide.variables === 'confirm'}
            onClick={() => decide.mutate('confirm')}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<X className="size-4" />}
            disabled={decide.isPending}
            onClick={() => decide.mutate('cancel')}
          >
            Cancel
          </Button>
        </div>
      )}
    </motion.div>
  );
}

export function ChatPanel({ scope, compact = false }: { scope: Scope; compact?: boolean }) {
  const qc = useQueryClient();
  const brand = useBrand();
  const { user } = useAuth();
  const status = useQuery({
    queryKey: ['mitra', scope, 'status'],
    queryFn: () => get<AgentStatus>(`${base(scope)}/status`),
  });
  const list = useQuery({
    queryKey: ['mitra', scope, 'conversations'],
    queryFn: () => get<ConversationSummary[]>(`${base(scope)}/conversations`),
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const conv = useQuery({
    queryKey: ['mitra', scope, 'conversation', activeId],
    queryFn: () => get<Conversation>(`${base(scope)}/conversations/${activeId}`),
    enabled: Boolean(activeId),
  });
  const [text, setText] = useState('');
  const [live, setLive] = useState<{ question: string; steps: string[]; actions: AgentAction[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conv.data, live]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['mitra', scope, 'conversation', activeId] }),
      qc.invalidateQueries({ queryKey: ['mitra', scope, 'conversations'] }),
      qc.invalidateQueries({ queryKey: ['mitra', scope, 'status'] }),
    ]);
  };

  const send = async (message: string) => {
    const q = message.trim();
    if (!q || live) return;
    setText('');
    let id = activeId;
    try {
      if (!id) {
        const c = await post<{ _id: string }>(`${base(scope)}/conversations`);
        id = c._id;
        setActiveId(id);
      }
    } catch (e) {
      toast.error(errorMessage(e));
      return;
    }
    setLive({ question: q, steps: [], actions: [] });
    await streamMessage(`${base(scope)}/conversations/${id}/messages`, q, (e) => {
      if (e.type === 'tool') setLive((l) => (l ? { ...l, steps: [...l.steps, e.label] } : l));
      if (e.type === 'action') setLive((l) => (l ? { ...l, actions: [...l.actions, e.action] } : l));
      if (e.type === 'error') toast.error(e.message);
    }).catch(() => toast.error('The connection was interrupted.'));
    await qc.invalidateQueries({ queryKey: ['mitra', scope, 'conversation', id] });
    await qc.invalidateQueries({ queryKey: ['mitra', scope, 'conversations'] });
    await qc.invalidateQueries({ queryKey: ['mitra', scope, 'status'] });
    setLive(null);
  };

  const remove = useMutation({
    mutationFn: (id: string) => del(`${base(scope)}/conversations/${id}`),
    onSuccess: async () => {
      setActiveId(null);
      await qc.invalidateQueries({ queryKey: ['mitra', scope, 'conversations'] });
    },
  });

  const s = status.data;
  const name = s?.agentName ?? brand.agentName;
  const messages = conv.data?.messages ?? [];
  const actions = conv.data?.actions ?? [];
  const empty = !activeId && !live;

  return (
    <div className={cn('grid min-h-0 gap-4', !compact && 'lg:grid-cols-[260px_1fr]')}>
      {!compact && (
        <aside className="border-line bg-card hidden min-h-0 flex-col rounded-[var(--radius-card)] border p-3 shadow-[var(--shadow-card)] lg:flex">
          <Button
            variant="soft"
            className="w-full"
            icon={<MessageSquarePlus className="size-4" />}
            onClick={() => setActiveId(null)}
          >
            New conversation
          </Button>
          <p className="text-muted mt-4 mb-2 px-1 text-[11px] font-semibold tracking-wide uppercase">Recent</p>
          <ul className="-mx-1 max-h-[60vh] space-y-0.5 overflow-y-auto">
            {(list.data ?? []).map((c) => (
              <li key={c._id} className="group flex items-center">
                <button
                  onClick={() => setActiveId(c._id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[13px]',
                    activeId === c._id ? 'bg-primary-soft text-primary font-semibold' : 'text-body hover:bg-card-soft',
                  )}
                >
                  {c.title}
                </button>
                <button
                  aria-label={`Delete ${c.title}`}
                  onClick={() => remove.mutate(c._id)}
                  className="text-muted hover:text-ink invisible rounded p-1 group-hover:visible focus:visible"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
            {!list.data?.length && <li className="text-muted px-2.5 py-2 text-[12.5px]">No conversations yet.</li>}
          </ul>
        </aside>
      )}

      <section
        className={cn(
          'border-line bg-card flex min-h-0 flex-col rounded-[var(--radius-card)] border shadow-[var(--shadow-card)]',
          compact ? 'h-full rounded-none border-0 shadow-none' : 'h-[calc(100dvh-230px)] min-h-[520px]',
        )}
      >
        <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <MitraAvatar />
            <div className="min-w-0">
              <p className="text-ink truncate text-[15px] font-bold">
                {conv.data?.title && activeId ? conv.data.title : `Ask ${name}`}
              </p>
              <p className="text-muted text-[12px]">
                {s ? `${s.usage.messages} of ${s.usage.limit} messages today` : 'Admission copilot'}
                {s?.provider && ` · ${s.provider}${s.model ? ` (${s.model})` : ''}`}
              </p>
            </div>
          </div>
          {(compact || activeId) && (
            <Button
              size="sm"
              variant="ghost"
              icon={<MessageSquarePlus className="size-4" />}
              onClick={() => setActiveId(null)}
            >
              New
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
          {s && !s.available && <Alert tone="info">{s.reason}</Alert>}
          {s && s.available && !s.configured && (
            <Alert tone="info">
              {scope === 'platform'
                ? `${name} is not connected to an AI provider yet. Add AI_API_KEY (and AI_PROVIDER, AI_MODEL) to the backend .env file and restart the API. Briefings and alerts already work.`
                : `${name} is not connected yet. Please ask ${brand.platformName} support.`}
            </Alert>
          )}
          {empty && (
            <div className="mx-auto max-w-2xl py-6 text-center">
              <MitraAvatar className="mx-auto size-14" />
              <h2 className="mt-4 text-[20px] font-bold">
                Hello{user ? `, ${user.fullName.split(' ')[0]}` : ''}. I am {name}.
              </h2>
              <p className="text-muted mt-1 text-[14px]">
                {scope === 'platform'
                  ? 'Ask about institutions, fees, applications, payments, tickets or anything unusual on the platform.'
                  : 'Ask about your applications, payments, merit lists, seats and alerts. I can also prepare reminders for you to confirm.'}
              </p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                {(s?.suggestions ?? []).map((q) => (
                  <button
                    key={q}
                    onClick={() => void send(q)}
                    disabled={!s?.available}
                    className="border-line bg-card-soft hover:border-primary/50 hover:bg-primary-soft text-body rounded-xl border px-3.5 py-3 text-[13px] transition disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeId &&
            messages.map((m) =>
              m.role === 'user' ? (
                <div key={m._id} className="flex justify-end gap-3">
                  <div className="bg-primary max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-[14px] whitespace-pre-wrap text-white">
                    {m.content}
                  </div>
                  {user && (
                    <Avatar name={user.fullName} src={user.avatarUrl} className="hidden size-8 text-[11px] sm:flex" />
                  )}
                </div>
              ) : (
                <div key={m._id} className="flex gap-3">
                  <MitraAvatar className="size-8" />
                  <div className="max-w-[90%] min-w-0 flex-1">
                    {m.content && (
                      <div
                        className={cn(
                          'text-ink rounded-2xl rounded-tl-md px-4 py-2.5',
                          m.actionId ? 'bg-card-soft text-[13px]' : 'bg-card-soft',
                        )}
                      >
                        <Markdown text={m.content} />
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          {activeId &&
            actions
              .filter((a) => a.status === 'PENDING')
              .map((a) => (
                <div key={a._id} className="pl-11">
                  <ActionCard action={a} scope={scope} onDone={() => void refresh()} />
                </div>
              ))}

          <AnimatePresence>
            {live && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                {!messages.some((m) => m.content === live.question) && (
                  <div className="flex justify-end">
                    <div className="bg-primary max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-[14px] whitespace-pre-wrap text-white">
                      {live.question}
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <MitraAvatar className="size-8" />
                  <div className="bg-card-soft text-body rounded-2xl rounded-tl-md px-4 py-3 text-[13px]">
                    {live.steps.length ? (
                      <ul className="space-y-1">
                        {live.steps.map((st, k) => (
                          <li key={k} className="flex items-center gap-2">
                            {k === live.steps.length - 1 ? (
                              <Loader2 className="text-primary size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5 text-green-700 dark:text-green-400" />
                            )}
                            {st}…
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Loader2 className="text-primary size-3.5 animate-spin" /> Thinking…
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </div>

        <form
          className="border-line flex items-end gap-2 border-t p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label htmlFor={`mitra-input-${scope}${compact ? '-c' : ''}`} className="sr-only">
            Message to {name}
          </label>
          <textarea
            id={`mitra-input-${scope}${compact ? '-c' : ''}`}
            value={text}
            rows={1}
            maxLength={2000}
            disabled={!s?.available}
            placeholder={`Ask ${name} anything about ${scope === 'platform' ? 'the platform' : 'your admissions'}…`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            className="border-line bg-card text-ink placeholder:text-muted focus:border-primary max-h-40 min-h-11 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-[14px] outline-none focus:ring-4 focus:ring-[var(--ring)]"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!text.trim() || Boolean(live) || !s?.available}
            loading={Boolean(live)}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </section>
    </div>
  );
}
