import { InstitutionDetail } from '@/features/platform/institution-detail';

export const metadata = { title: 'Institution' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InstitutionDetail id={id} />;
}
