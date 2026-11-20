import { TicketList } from '@/features/support/ticket-list';

export const metadata = { title: 'Support' };

export default function Page() {
  return <TicketList side="institution" />;
}
