import Link from 'next/link';
import { Logo } from './logo';

export function PublicFooter() {
  return (
    <footer className="border-line bg-card mt-16 border-t">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="text-muted mt-3 max-w-sm text-[13px] leading-relaxed">
            One profile for every college and university. Apply online with verified marks and follow your admission
            from one place.
          </p>
        </div>
        <div>
          <p className="text-ink text-[13px] font-bold">Students</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li>
              <Link href="/programs" className="hover:text-primary">
                Find programs
              </Link>
            </li>
            <li>
              <Link href="/institutions" className="hover:text-primary">
                Institutions
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:text-primary">
                Create an account
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-ink text-[13px] font-bold">Institutions</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li>
              <Link href="/register-institution" className="hover:text-primary">
                Register your institution
              </Link>
            </li>
            <li>
              <Link href="/help" className="hover:text-primary">
                Help and FAQ
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-primary">
                Staff login
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="border-line text-muted border-t py-4 text-center text-[12px]">
        ADMITRA - Final Year Project, Department of Computer Science, Government College University Faisalabad
      </p>
    </footer>
  );
}
