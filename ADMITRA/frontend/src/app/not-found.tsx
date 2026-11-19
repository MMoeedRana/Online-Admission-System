import { SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="bg-primary-soft text-primary flex size-16 items-center justify-center rounded-2xl">
        <SearchX className="size-8" />
      </span>
      <h1 className="mt-5 text-[24px] font-bold">Page not found</h1>
      <p className="text-muted mt-2 max-w-sm text-[14px]">
        The page you are looking for does not exist or has been moved.
      </p>
      <ButtonLink href="/" className="mt-6">
        Go to home page
      </ButtonLink>
    </div>
  );
}
