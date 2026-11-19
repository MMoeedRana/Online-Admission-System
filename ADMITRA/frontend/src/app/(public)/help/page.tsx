import { ChevronDown, LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Help and FAQ' };

const groups = [
  {
    title: 'For students',
    items: [
      [
        'Do I need a separate account for every institution?',
        'No. You create one ADMITRA account and keep one profile and one academic record. You can apply to any institution on ADMITRA with the same account.',
      ],
      [
        'How do I create an account?',
        'Click Register, enter your full name, e-mail and a password of at least 8 characters with an upper-case letter, a lower-case letter and a digit. We send you a link to verify your e-mail.',
      ],
      [
        'I forgot my password. What should I do?',
        'Open the login page and choose "Forgot password". We send a link that works once and is valid for 30 minutes.',
      ],
      [
        'Why was my account locked?',
        'After five wrong passwords the account is locked for 15 minutes to protect it. Wait and try again, or reset your password.',
      ],
      [
        'How do I know if a program is open for admission?',
        'Program pages show a green "Open until" badge with the closing date. You can also tick "Only programs open for admission" on the Programs page.',
      ],
      [
        'Why must my marks be verified?',
        'ADMITRA checks marks against official board results so that merit lists are built only from real marks. This protects honest students.',
      ],
    ],
  },
  {
    title: 'For institutions',
    items: [
      [
        'How can our institution join ADMITRA?',
        'Fill the "Register your institution" form. Our team reviews the request, approves it with a subscription plan and e-mails an invitation to your contact person.',
      ],
      [
        'Can we configure our own programs and rules?',
        'Yes. Each institution manages its campuses, departments, programs (shifts, seats, eligibility and fees) and admission campaigns in its own private workspace.',
      ],
      [
        'How are staff accounts created?',
        'The institution admin invites staff by e-mail and gives each person one or more roles: Admission Officer, Department (HOD) Officer, Finance Officer or Merit Committee.',
      ],
      [
        'What happens when our subscription ends?',
        'The workspace remains usable for a 7-day grace period and then becomes read-only. No data is deleted; renewing the plan restores full access.',
      ],
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Help and FAQ</h1>
      <p className="text-muted mt-1 text-[14px]">Answers to common questions about ADMITRA.</p>
      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-[17px] font-bold">{g.title}</h2>
          <div className="mt-3 space-y-3">
            {g.items.map(([q, a]) => (
              <details key={q} className="group border-line bg-card rounded-2xl border p-5 shadow-[var(--shadow-card)]">
                <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold">
                  {q}
                  <ChevronDown className="text-muted size-5 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[14px] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <Card className="mt-10 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <span className="bg-primary-soft text-primary flex size-12 items-center justify-center rounded-xl">
          <LifeBuoy className="size-6" />
        </span>
        <div className="flex-1">
          <p className="text-ink text-[15px] font-bold">Is your institution not on ADMITRA yet?</p>
          <p className="text-muted text-[13.5px]">Send an onboarding request and our team will contact you.</p>
        </div>
        <ButtonLink href="/register-institution">Register your institution</ButtonLink>
      </Card>
    </div>
  );
}
