import { AuditLog } from '@/features/audit/audit-log';

export const metadata = { title: 'Audit log' };

export default function Page() {
  return <AuditLog scope="institution" />;
}
