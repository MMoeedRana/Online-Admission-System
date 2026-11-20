import { TicketList } from '@/features/support/ticket-list';

export const metadata = { title: 'Support tickets' };

export default function Page() {
  return <TicketList side="platform" />;
}
