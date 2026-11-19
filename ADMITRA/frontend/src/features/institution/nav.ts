import {
  Award,
  BookOpen,
  Building,
  CalendarRange,
  CreditCard,
  FileCheck2,
  FileText,
  GraduationCap,
  LayoutGrid,
  ListOrdered,
  Mail,
  Settings,
  ShieldCheck,
  Sigma,
  Users,
} from 'lucide-react';
import type { NavSection } from '@/components/layout/staff-shell';

/** Institution workspace menu; items are shown by permission. */
export const institutionNav: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/institution/dashboard', label: 'Dashboard', icon: LayoutGrid, permission: 'dashboard.view' },
      { href: '/institution/applications', label: 'Applications', icon: FileText, permission: 'applications.review' },
      {
        href: '/institution/verifications',
        label: 'Marks Verification',
        icon: ShieldCheck,
        permission: 'marks.verify',
      },
      { href: '/institution/payments', label: 'Payments', icon: CreditCard, permission: 'payments.verify' },
      {
        href: '/institution/merit-formulas',
        label: 'Merit Formulas',
        icon: Sigma,
        permission: ['merit.manage', 'merit.publish'],
      },
      {
        href: '/institution/merit-lists',
        label: 'Merit Lists',
        icon: ListOrdered,
        permission: ['merit.manage', 'merit.publish'],
      },
      {
        href: '/institution/offers',
        label: 'Offers & Enrollment',
        icon: Award,
        permission: ['applications.review', 'merit.publish', 'merit.manage', 'payments.verify'],
      },
      { href: '/institution/campaigns', label: 'Campaigns', icon: CalendarRange, permission: 'structure.view' },
      { href: '/institution/programs', label: 'Programs', icon: GraduationCap, permission: 'structure.view' },
      { href: '/institution/structure', label: 'Academic Structure', icon: Building, permission: 'structure.view' },
    ],
  },
  {
    title: 'General',
    items: [
      { href: '/institution/staff', label: 'Staff & Roles', icon: Users, permission: 'staff.manage' },
      {
        href: '/institution/document-requirements',
        label: 'Document Requirements',
        icon: FileCheck2,
        permission: 'institution.settings',
      },
      {
        href: '/institution/email-templates',
        label: 'E-mail Templates',
        icon: Mail,
        permission: 'institution.settings',
      },
      { href: '/institution/directory', label: 'Directory Data', icon: BookOpen, permission: 'directory.edit' },
      { href: '/institution/settings', label: 'Settings', icon: Settings, permission: 'institution.settings' },
    ],
  },
];
