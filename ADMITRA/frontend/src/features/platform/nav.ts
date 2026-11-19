import { Building2, CreditCard, LayoutGrid } from 'lucide-react';
import type { NavSection } from '@/components/layout/staff-shell';

export const platformNav: NavSection[] = [
  {
    title: 'Platform',
    items: [
      { href: '/platform/dashboard', label: 'Dashboard', icon: LayoutGrid },
      { href: '/platform/institutions', label: 'Institutions', icon: Building2 },
      { href: '/platform/plans', label: 'Plans', icon: CreditCard },
    ],
  },
];
