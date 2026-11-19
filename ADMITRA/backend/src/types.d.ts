import type { Permission } from './constants/permissions';
import type { StaffRole } from './constants/roles';
import type { SubscriptionState } from './modules/institutions/institution.model';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; accountType: string; platformRole: string | null; name: string };
      tenant?: {
        institutionId: string;
        institution: { _id: unknown; name: string; status: string; planId: unknown; subscription?: unknown };
        memberId: string;
        roles: StaffRole[];
        departmentIds: string[];
        permissions: Permission[];
        subscription: SubscriptionState;
      };
    }
  }
}

export {};
