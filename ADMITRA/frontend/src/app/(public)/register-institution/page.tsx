import type { Metadata } from 'next';
import { OnboardingForm } from '@/features/public/onboarding-form';

export const metadata: Metadata = { title: 'Register your institution' };

export default function RegisterInstitutionPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Register your institution</h1>
      <p className="text-muted mt-1 max-w-2xl text-[14px]">
        Request an ADMITRA workspace for your college or university. After approval you receive an invitation to set up
        programs, staff and admission campaigns.
      </p>
      <OnboardingForm />
    </div>
  );
}
