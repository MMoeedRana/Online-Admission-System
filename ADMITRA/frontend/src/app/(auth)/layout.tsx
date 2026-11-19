import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';

const points = [
  'One account for every college and university',
  'Marks verified against official board results',
  'Follow every application and result in one place',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="hero-gradient relative hidden flex-col justify-between p-12 text-white lg:flex">
        <Logo light />
        <div>
          <h2 className="max-w-md text-[38px] leading-tight font-extrabold text-white">
            One profile. Every college and university.
          </h2>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[15px] text-blue-100">
                <CheckCircle2 className="size-5 text-blue-300" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12.5px] text-blue-200/70">
          Department of Computer Science, Government College University Faisalabad
        </p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
