import Link from 'next/link';
import { cn } from '@/lib/utils';

export function ProfileTabs({ active }: { active: 'profile' | 'records' }) {
  const tab = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={cn(
        'inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-semibold',
        active === key ? 'border-primary bg-primary text-white' : 'border-line bg-card text-body hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-6 flex gap-2">
      {tab('/applicant/records', 'Academic record', 'records')}
      {tab('/applicant/profile', 'Personal profile', 'profile')}
    </div>
  );
}
