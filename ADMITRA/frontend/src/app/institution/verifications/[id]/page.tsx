import { VerificationPanel } from '@/features/staff/verification-panel';

export const metadata = { title: 'Verify marks' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerificationPanel id={id} />;
}
