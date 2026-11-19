import { RoleShell } from '@/features/auth/role-shell';

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <RoleShell>{children}</RoleShell>;
}
