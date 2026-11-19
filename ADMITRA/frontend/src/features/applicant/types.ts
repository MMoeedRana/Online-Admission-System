export interface Subject {
  name: string;
  obtained: number;
  total: number;
}

export interface AcademicRecord {
  _id: string;
  level: 'MATRIC' | 'INTERMEDIATE' | 'BACHELOR_14' | 'BACHELOR_16' | 'MASTER' | 'ENTRY_TEST';
  board: string;
  examType: string;
  testName: string;
  group: string;
  year: number;
  rollNo: string;
  registrationNo: string;
  studentName: string;
  fatherName: string;
  subjects: Subject[];
  obtained: number;
  total: number;
  percentage: number;
  trustLevel: number;
  trustLabel?: string;
  verificationStatus: string;
  flags: string[];
  registryDiff: { field: string; entered: unknown; official: unknown }[];
  resultCardFileId: string | null;
  version: number;
  locked: boolean;
  updatedAt: string;
}

export interface Profile {
  cnic: string;
  cnicFormatted?: string;
  fullName: string;
  fatherName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone: string;
  nationality: string;
  domicile: string;
  religion: string;
  guardian: { name: string; relation: string; phone: string; occupation: string };
  permanentAddress: { line: string; city: string; province: string };
  currentAddress: { line: string; city: string; province: string };
}

export interface AppListItem {
  _id: string;
  applicationNumber: string | null;
  status: string;
  progress: number;
  nextAction: string;
  institution?: { name: string; shortName: string; city: string };
  campaign?: { title: string; closesAt: string };
  programs: string[];
  voucher: { status: string; amount: number } | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface EligibilityCheck {
  level: string;
  label: string;
  ok: boolean;
  reason: string;
}

export interface DocType {
  _id: string;
  name: string;
  code: string;
  description: string;
  formats: string[];
  maxSizeMB: number;
  required: boolean;
}

export interface AppDocument {
  _id: string;
  documentTypeId: string;
  fileId: { _id: string; originalName: string; mimeType: string; size: number };
  version: number;
  current: boolean;
  status: 'UPLOADED' | 'APPROVED' | 'REJECTED';
  reviewTrail: { decision: string; reason: string; reviewerName: string; at: string }[];
  createdAt: string;
}

export interface Voucher {
  _id: string;
  voucherNumber: string;
  type: string;
  items: { label: string; amount: number }[];
  amount: number;
  dueDate: string;
  status: string;
  createdAt: string;
}

export interface Payment {
  _id: string;
  method: string;
  reference: string;
  amount: number;
  paidOn: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  receiptNumber: string | null;
  reason: string;
  decidedAt: string | null;
  createdAt: string;
}

export interface HistoryItem {
  from: string;
  to: string;
  actor: string;
  byName?: string;
  note?: string;
  at: string;
}

export interface AppDetail {
  application: {
    _id: string;
    applicationNumber: string | null;
    status: string;
    preferences: { programId: string; shift: string; order: number }[];
    history: HistoryItem[];
    deficiency?: { message: string; at: string };
    submittedAt: string | null;
    createdAt: string;
  };
  progress: number;
  nextAction: string;
  institution: { _id: string; name: string; shortName: string; city: string };
  campaign: {
    _id: string;
    title: string;
    code: string;
    closesAt: string;
    status: string;
    settings: { maxPreferences: number; feePolicy: string; minTrustLevel: number };
  };
  programs: {
    _id: string;
    title: string;
    code: string;
    degreeLevel: string;
    shifts: { name: string; seats: number }[];
    seatCap: number | null;
    applicationFee: number;
    eligibility: { eligible: boolean; checks: EligibilityCheck[] };
  }[];
  documentTypes: DocType[];
  documents: AppDocument[];
  missing: { key: string; message: string }[];
  fee: { amount: number; items: { label: string; amount: number }[] };
  vouchers: Voucher[];
  payments: Payment[];
  canWithdraw: boolean;
}

export const LEVEL_LABELS: Record<string, string> = {
  MATRIC: 'Matric / O-Level',
  INTERMEDIATE: 'Intermediate / A-Level',
  BACHELOR_14: "Bachelor's (14 years)",
  BACHELOR_16: "Bachelor's (16 years)",
  MASTER: "Master's",
  ENTRY_TEST: 'Entry test',
};
