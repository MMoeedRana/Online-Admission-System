import { ApplicationView } from '@/features/applicant/application-view';

export const metadata = { title: 'Application' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationView id={id} />;
}
