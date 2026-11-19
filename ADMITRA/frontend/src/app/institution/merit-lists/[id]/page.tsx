import { MeritListDetail } from '@/features/merit/merit-list-detail';

export const metadata = { title: 'Merit list' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeritListDetail id={id} />;
}
