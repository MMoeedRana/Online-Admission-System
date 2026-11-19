import type { StaffRole } from './constants';

export interface User {
  id: string;
  fullName: string;
  email: string;
  accountType: 'APPLICANT' | 'STAFF' | 'PLATFORM';
  platformRole: 'SUPER_ADMIN' | null;
  emailVerified: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface Membership {
  institutionId: string;
  name: string;
  shortName: string;
  slug: string;
  city: string;
  status: string;
  logoUrl: string;
  roles: StaffRole[];
  permissions: string[];
}

export interface Session {
  accessToken: string;
  user: User;
  memberships: Membership[];
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface Plan {
  _id: string;
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  trialDays: number;
  limits: { campuses: number; programs: number; staff: number; applicationsPerCycle: number };
  features: { multipleCampuses: boolean; customBranding: boolean; advancedAnalytics: boolean; apiAccess: boolean };
  status: 'ACTIVE' | 'RETIRED';
  institutions?: number;
}

export interface Institution {
  _id: string;
  name: string;
  shortName: string;
  slug: string;
  type: 'UNIVERSITY' | 'COLLEGE' | 'INSTITUTE';
  sector: 'PUBLIC' | 'PRIVATE';
  city: string;
  province: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  about: string;
  contact: { name: string; designation: string; email: string; phone: string };
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  statusReason: string;
  planId: string | Plan | null;
  subscription: { startsAt: string | null; endsAt: string | null; isTrial: boolean };
  subscriptionState?: 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'NONE';
  branding: { logoUrl: string; primaryColor: string };
  bankAccount: { bankName: string; accountTitle: string; accountNumber: string; iban: string };
  settings: { eligibilityAsSeparateStep: boolean; requireOriginals?: boolean };
  createdAt: string;
}

export interface Campus {
  _id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  isMain: boolean;
}
export interface Faculty {
  _id: string;
  name: string;
  code: string;
}
export interface Department {
  _id: string;
  name: string;
  code: string;
  facultyId: string;
  campusIds: string[];
}
export interface AcademicSession {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface Eligibility {
  level: string;
  minPercentage: number;
  groups: string[];
  subjects: string[];
}

export interface Program {
  _id: string;
  title: string;
  code: string;
  degreeLevel: string;
  fieldGroup: string;
  durationYears: number;
  description: string;
  departmentId: string | { _id: string; name: string; code: string };
  campusId: string | { _id: string; name: string; code: string };
  shifts: { name: string; seats: number }[];
  eligibility: Eligibility[];
  testRequired: boolean;
  testName: string;
  applicationFee: number;
  admissionFee: number;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface Campaign {
  _id: string;
  title: string;
  code: string;
  sessionId: string | { _id: string; name: string };
  opensAt: string;
  closesAt: string;
  programs: { programId: string | Program; seatCap: number | null }[];
  settings: {
    maxPreferences: number;
    duplicatePolicy: 'ONE_ACTIVE' | 'ALLOW_MULTIPLE';
    latePolicy: 'REFUSE' | 'ALLOW';
    feePolicy: 'HIGHEST' | 'SUM';
    minTrustLevel: number;
  };
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  history: { from: string; to: string; at: string; auto?: boolean }[];
}

export interface StaffMember {
  _id: string;
  email: string;
  fullName: string;
  designation: string;
  roles: StaffRole[];
  departmentIds: { _id: string; name: string; code: string }[];
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  ip: string;
}

/** Public program card returned by /public endpoints. */
export interface PublicProgram {
  id: string;
  title: string;
  code: string;
  degreeLevel: string;
  fieldGroup: string;
  durationYears: number;
  seats: number;
  shifts: { name: string; seats: number }[];
  applicationFee: number;
  admissionFee: number;
  testRequired: boolean;
  institution: {
    name: string;
    shortName: string;
    slug: string;
    city: string;
    province: string;
    sector: string;
    logoUrl: string;
  } | null;
  openCampaign: { campaignId: string; title: string; closesAt: string } | null;
}

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}
