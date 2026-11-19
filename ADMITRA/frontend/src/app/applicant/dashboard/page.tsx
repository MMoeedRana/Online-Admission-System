import type { Metadata } from 'next';
import { ApplicantDashboard } from '@/features/applicant/dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <ApplicantDashboard />;
}
