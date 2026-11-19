import { OfferPage } from '@/features/results/offer-page';

export const metadata = { title: 'Admission offer' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OfferPage applicationId={id} />;
}
