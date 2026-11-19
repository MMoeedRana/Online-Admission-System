import { ApplicationReview } from '@/features/staff/application-review';

export const metadata = { title: 'Review application' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationReview id={id} />;
}
