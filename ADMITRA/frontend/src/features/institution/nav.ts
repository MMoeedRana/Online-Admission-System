import { Building, CalendarRange, GraduationCap, LayoutGrid, Settings, Users } from 'lucide-react';
import type { NavSection } from '@/components/layout/staff-shell';

/** Institution workspace menu (Phase 1 screens); items are shown by permission. */
export const institutionNav: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/institution/dashboard', label: 'Dashboard', icon: LayoutGrid, permission: 'dashboard.view' },
      { href: '/institution/campaigns', label: 'Campaigns', icon: CalendarRange, permission: 'structure.view' },
      { href: '/institution/programs', label: 'Programs', icon: GraduationCap, permission: 'structure.view' },
      { href: '/institution/structure', label: 'Academic Structure', icon: Building, permission: 'structure.view' },
    ],
  },
  {
    title: 'General',
    items: [
      { href: '/institution/staff', label: 'Staff & Roles', icon: Users, permission: 'staff.manage' },
      { href: '/institution/settings', label: 'Settings', icon: Settings, permission: 'institution.settings' },
    ],
  },
];
