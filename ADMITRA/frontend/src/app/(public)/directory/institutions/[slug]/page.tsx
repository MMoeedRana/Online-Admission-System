import { DirectoryInstitutionDetail } from '@/features/directory/institution-detail';

export const metadata = { title: 'Institution' };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="page-container py-8">
      <DirectoryInstitutionDetail slug={slug} />
    </div>
  );
}
