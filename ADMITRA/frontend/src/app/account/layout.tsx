import { RoleShell } from '@/features/auth/role-shell';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <RoleShell>{children}</RoleShell>;
}
