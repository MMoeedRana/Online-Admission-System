export type Band = 'SAFE' | 'TARGET' | 'REACH' | 'UNLIKELY' | 'INSUFFICIENT_DATA' | 'NOT_ELIGIBLE';

export interface BreakdownLine {
  component: string;
  label: string;
  percentage: number | null;
  weight: number;
  contribution: number;
  note?: string;
}

export interface AdvisorResult {
  directoryProgramId: string;
  title: string;
  degreeLevel: string;
  fieldGroup: string;
  feePerSemester: number;
  seats: number;
  shift: string;
  institution: {
    _id: string;
    name: string;
    shortName: string;
    slug: string;
    city: string;
    province: string;
    sector: string;
    type: string;
    onAdmitra: boolean;
    website: string;
  };
  aggregate: number;
  breakdown: BreakdownLine[];
  standardFormula: boolean;
  assumedTest: boolean;
  eligible: boolean;
  reasons: string[];
  history: { year: number; round: number; closing: number; source: string; sourceUrl: string; origin: string }[];
  lastClosing: number | null;
  gap: number | null;
  prediction: { mu: number; sigma: number; z: number; chance: number; band: Band } | null;
  band: Band;
  openCampaign: { campaignId: string; programId: string; closesAt: string; title: string } | null;
  applyUrl: string;
  standing: { band: 'TOP_10' | 'TOP_25' | 'TOP_50' | 'LOWER'; applicants: number } | null;
}

export interface AdvisorMeta {
  basis: 'VERIFIED' | 'SELF_DECLARED' | 'ENTERED';
  inputs: { matric: number; inter: number; test: number | null; fieldGroup: string };
  bands: Partial<Record<Band, number>>;
  notice: string;
}

export interface HistoryRow {
  _id?: string;
  year: number;
  round: number;
  shift: string;
  quota: string;
  openingMerit: number | null;
  closingMerit: number;
  seats: number | null;
  source: string;
  sourceUrl: string;
  origin: 'MANUAL' | 'IMPORT' | 'ADMITRA';
  status?: 'DRAFT' | 'VERIFIED' | 'REJECTED';
}

export interface DirProgram {
  _id: string;
  title: string;
  degreeLevel: string;
  fieldGroup: string;
  durationYears: number;
  feePerSemester: number;
  shifts: string[];
  seats: number;
  eligibility: { level: string; minPercentage: number; groups: string[] }[];
  formula: { component: string; weight: number }[];
  testName: string;
  admissionMonths: number[];
  applyUrl: string;
  programId?: string | null;
}

export interface DirInstitution {
  _id: string;
  name: string;
  shortName: string;
  slug: string;
  type: string;
  sector: string;
  city: string;
  province: string;
  website: string;
  about: string;
  campuses: { name: string; city: string }[];
  onAdmitra?: boolean;
  programs?: number;
}

export interface ProgramSummary {
  dataStatus: 'VERIFIED' | 'DRAFT' | 'NONE';
  dataYear: number | null;
  lastClosing: number | null;
  source: string | null;
  sourceUrl: string | null;
  origin: string | null;
  openCampaign: { campaignId: string; title: string; closesAt: string } | null;
}

export type DirProgramRow = Pick<
  DirProgram,
  '_id' | 'title' | 'degreeLevel' | 'fieldGroup' | 'durationYears' | 'feePerSemester' | 'shifts' | 'seats'
> &
  ProgramSummary & {
    institution: {
      _id: string;
      name: string;
      shortName: string;
      slug: string;
      city: string;
      sector: string;
      onAdmitra: boolean;
    };
  };

export interface AdvisorInputs {
  matric: string;
  inter: string;
  test: string;
  fieldGroup: string;
  degreeLevel: string;
  city: string;
  province: string;
  sector: string;
  maxFee: string;
  shift: string;
  useSaved: boolean;
}

export const INTER_GROUPS = [
  'Pre-Engineering',
  'Pre-Medical',
  'Pre-Medical (with Mathematics)',
  'ICS',
  'I.Com',
  'FA',
  'FA (IT)',
  'General Science',
  'A-Level',
];
