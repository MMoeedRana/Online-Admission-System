import { AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PRIORITIES, RESPONSE, TICKET_STATUS, relative, type Ticket } from './types';

export function TicketStatusBadge({ status }: { status: Ticket['status'] }) {
  const s = TICKET_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Ticket['priority'] }) {
  const p = PRIORITIES[priority];
  return (
    <Badge tone={p.tone} dot={false}>
      {priority === 'URGENT' && <AlertTriangle className="size-3.5" aria-hidden />}
      {p.label} · {p.hours} h
    </Badge>
  );
}

export function ResponseBadge({ t, now }: { t: Ticket; now: number }) {
  const r = RESPONSE[t.responseState];
  return (
    <Badge tone={r.tone} dot={false}>
      <Clock className="size-3.5" aria-hidden />
      {t.responseState === 'DUE'
        ? `Reply due ${relative(t.responseDueAt, now)}`
        : t.responseState === 'OVERDUE'
          ? `Overdue ${relative(t.responseDueAt, now).replace(' ago', '')}`
          : r.label}
    </Badge>
  );
}
