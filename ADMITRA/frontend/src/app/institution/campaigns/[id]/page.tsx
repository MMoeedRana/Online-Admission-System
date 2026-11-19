import { CampaignEditor } from '@/features/institution/campaign-form';

export const metadata = { title: 'Campaign' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignEditor id={id} />;
}
