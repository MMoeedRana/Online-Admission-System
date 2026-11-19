import type {
  AcademicRecord,
  AppDocument,
  DocType,
  EligibilityCheck,
  HistoryItem,
  Payment,
  Profile,
  Voucher,
} from '@/features/applicant/types';

export interface QueueItem {
  _id: string;
  applicationNumber: string;
  status: string;
  submittedAt: string;
  applicant: { name: string };
  programs: { _id: string; title: string; code: string }[];
  marks: 'NONE' | 'VERIFIED' | 'PENDING' | 'MISMATCH';
  flagged: boolean;
}

export interface FraudFlag {
  _id: string;
  type: string;
  details: string;
  status: string;
  createdAt: string;
}

export interface StaffAppDetail {
  application: {
    _id: string;
    applicationNumber: string;
    status: string;
    submittedAt: string;
    history: HistoryItem[];
    notes: { text: string; byName: string; at: string }[];
    deficiency?: { message: string; at: string };
  };
  applicant: { email: string; profile: (Profile & { cnicFormatted?: string }) | null };
  campaign: { _id: string; title: string };
  preferences: {
    programId: string;
    shift: string;
    order: number;
    program: { _id: string; title: string; code: string } | null;
    eligibility: { eligible: boolean; checks: EligibilityCheck[] } | null;
  }[];
  records: AcademicRecord[];
  documentTypes: DocType[];
  documents: AppDocument[];
  vouchers: Voucher[];
  payments: (Payment & { proofFileId: string })[];
  flags: FraudFlag[];
  actions: { to: string; label: string; noteRequired: boolean }[];
  canReviewDocuments: boolean;
}
