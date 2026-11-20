import { BarChart3, BookOpen, Building2, CreditCard, Database, History, LayoutGrid, LifeBuoy } from 'lucide-react';
import type { NavSection } from '@/components/layout/staff-shell';

export const platformNav: NavSection[] = [
  {
    title: 'Platform',
    items: [
      { href: '/platform/dashboard', label: 'Dashboard', icon: LayoutGrid },
      { href: '/platform/institutions', label: 'Institutions', icon: Building2 },
      { href: '/platform/plans', label: 'Plans', icon: CreditCard },
      { href: '/platform/registry', label: 'Registry Import', icon: Database },
      { href: '/platform/directory', label: 'Reference Directory', icon: BookOpen },
    ],
  },
  {
    title: 'Insight & support',
    items: [
      { href: '/platform/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/platform/support', label: 'Support Tickets', icon: LifeBuoy },
      { href: '/platform/audit-log', label: 'Audit Log', icon: History },
    ],
  },
];
