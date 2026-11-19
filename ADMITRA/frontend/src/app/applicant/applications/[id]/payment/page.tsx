import { PaymentPage } from '@/features/applicant/payment';

export const metadata = { title: 'Application fee' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentPage id={id} />;
}
