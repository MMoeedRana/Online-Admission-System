'use client';

import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';

export default function NoWorkspacePage() {
  const { logout, user } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="bg-primary-soft text-primary flex size-16 items-center justify-center rounded-2xl">
        <Building2 className="size-8" />
      </span>
      <h1 className="mt-5 text-[22px] font-bold">No active workspace</h1>
      <p className="text-muted mt-2 max-w-md text-[14px]">
        {user?.email} is not an active staff member of any institution. Ask your institution admin to invite you again
        or to re-enable your account.
      </p>
      <Button variant="secondary" className="mt-6" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  );
}
