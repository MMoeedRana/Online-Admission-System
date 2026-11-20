import { TicketDetail } from '@/features/support/ticket-detail';

export const metadata = { title: 'Support ticket' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetail id={id} side="institution" />;
}
