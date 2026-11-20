import { MitraPage } from '@/features/mitra/mitra-page';
import { serverBrand } from '@/lib/server-brand';

export async function generateMetadata() {
  return { title: (await serverBrand()).agentName };
}

export default function Page() {
  return <MitraPage scope="institution" />;
}
