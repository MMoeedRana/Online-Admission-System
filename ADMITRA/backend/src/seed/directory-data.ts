/**
 * Sample reference directory (Section 3.14). Every institution and figure here is fictional and
 * exists only to demonstrate the directory and the Admission Advisor.
 */
type Formula = { component: 'MATRIC' | 'INTERMEDIATE' | 'ENTRY_TEST' | 'BACHELOR_16'; weight: number }[];

export interface DirProgramSeed {
  title: string;
  degreeLevel: 'BS' | 'ASSOCIATE' | 'INTERMEDIATE' | 'MS';
  fieldGroup: string;
  years: number;
  fee: number;
  seats: number;
  shifts: ('MORNING' | 'EVENING')[];
  /** Closing merit of the latest year; earlier years are derived from it. */
  closing: number;
  minInter: number;
  groups: string[];
  formula?: Formula;
  test?: string;
  /** How many past years of history exist (default 3). */
  years_of_data?: number;
  /** The latest year is still waiting for the super admin's verification. */
  latestDraft?: boolean;
}

export interface DirInstitutionSeed {
  name: string;
  shortName: string;
  type: 'UNIVERSITY' | 'COLLEGE' | 'INSTITUTE';
  sector: 'PUBLIC' | 'PRIVATE';
  city: string;
  province: string;
  website: string;
  about: string;
  campuses: { name: string; city: string }[];
  months: number[];
  programs: DirProgramSeed[];
}

const UNI_TEST: Formula = [
  { component: 'MATRIC', weight: 10 },
  { component: 'INTERMEDIATE', weight: 40 },
  { component: 'ENTRY_TEST', weight: 50 },
];
const ENGG: Formula = [
  { component: 'MATRIC', weight: 17 },
  { component: 'INTERMEDIATE', weight: 50 },
  { component: 'ENTRY_TEST', weight: 33 },
];
const NO_TEST: Formula = [
  { component: 'MATRIC', weight: 30 },
  { component: 'INTERMEDIATE', weight: 70 },
];
const MS: Formula = [
  { component: 'BACHELOR_16', weight: 70 },
  { component: 'ENTRY_TEST', weight: 30 },
];

const ENG_GROUPS = ['Pre-Engineering'];
const COMP_GROUPS = ['Pre-Engineering', 'ICS', 'Pre-Medical (with Mathematics)'];
const ANY: string[] = [];

const p = (
  title: string,
  extra: Partial<DirProgramSeed> & Pick<DirProgramSeed, 'closing' | 'fee'>,
): DirProgramSeed => ({
  title,
  degreeLevel: 'BS',
  fieldGroup: 'Computing',
  years: 4,
  seats: 100,
  shifts: ['MORNING'],
  minInter: 50,
  groups: COMP_GROUPS,
  ...extra,
});

export const directoryInstitutions: DirInstitutionSeed[] = [
  {
    name: 'Margalla Hills Institute of Technology',
    shortName: 'MHIT',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Islamabad',
    province: 'Islamabad Capital Territory',
    website: 'https://mhit.example.edu.pk',
    about: 'Sample public engineering and computing university in Islamabad.',
    campuses: [{ name: 'H-12 Campus', city: 'Islamabad' }],
    months: [6, 7, 8],
    programs: [
      p('BS Computer Science', {
        closing: 86.9,
        fee: 68000,
        seats: 150,
        formula: UNI_TEST,
        test: 'MHIT Entry Test',
        minInter: 60,
      }),
      p('BS Software Engineering', {
        closing: 85.2,
        fee: 68000,
        seats: 100,
        formula: UNI_TEST,
        test: 'MHIT Entry Test',
        minInter: 60,
      }),
      p('BS Artificial Intelligence', {
        closing: 87.6,
        fee: 72000,
        seats: 60,
        formula: UNI_TEST,
        test: 'MHIT Entry Test',
        minInter: 60,
      }),
      p('BS Electrical Engineering', {
        closing: 84.1,
        fee: 75000,
        seats: 120,
        formula: ENGG,
        test: 'ECAT',
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        minInter: 60,
      }),
      p('BS Mechanical Engineering', {
        closing: 82.7,
        fee: 75000,
        seats: 100,
        formula: ENGG,
        test: 'ECAT',
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        minInter: 60,
      }),
      p('MS Computer Science', {
        degreeLevel: 'MS',
        years: 2,
        closing: 74.3,
        fee: 85000,
        seats: 30,
        formula: MS,
        test: 'GAT General',
        groups: ANY,
        shifts: ['EVENING'],
      }),
    ],
  },
  {
    name: 'Indus Delta University',
    shortName: 'IDU',
    type: 'UNIVERSITY',
    sector: 'PRIVATE',
    city: 'Karachi',
    province: 'Sindh',
    website: 'https://idu.example.edu.pk',
    about: 'Sample private university with business and computing schools in Karachi.',
    campuses: [
      { name: 'Clifton Campus', city: 'Karachi' },
      { name: 'Gulshan Campus', city: 'Karachi' },
    ],
    months: [5, 6, 7],
    programs: [
      p('BS Computer Science', {
        closing: 78.4,
        fee: 145000,
        seats: 200,
        formula: UNI_TEST,
        test: 'IDU Admission Test',
        shifts: ['MORNING', 'EVENING'],
      }),
      p('BS Data Science', {
        closing: 79.6,
        fee: 150000,
        seats: 80,
        formula: UNI_TEST,
        test: 'IDU Admission Test',
      }),
      p('BBA (Hons)', {
        closing: 72.8,
        fee: 160000,
        seats: 250,
        fieldGroup: 'Business',
        groups: ANY,
        formula: UNI_TEST,
        test: 'IDU Admission Test',
        shifts: ['MORNING', 'EVENING'],
      }),
      p('BS Accounting and Finance', {
        closing: 71.5,
        fee: 155000,
        seats: 120,
        fieldGroup: 'Business',
        groups: ANY,
        formula: UNI_TEST,
        test: 'IDU Admission Test',
      }),
      p('BS Media Studies', {
        closing: 64.2,
        fee: 120000,
        seats: 80,
        fieldGroup: 'Social Sciences',
        groups: ANY,
        formula: NO_TEST,
        minInter: 45,
      }),
    ],
  },
  {
    name: 'Ravi Bank University of Sciences',
    shortName: 'RBUS',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Lahore',
    province: 'Punjab',
    website: 'https://rbus.example.edu.pk',
    about: 'Sample public university of natural and computing sciences in Lahore.',
    campuses: [{ name: 'Old Campus', city: 'Lahore' }],
    months: [7, 8, 9],
    programs: [
      p('BS Computer Science', {
        closing: 84.8,
        fee: 42000,
        seats: 120,
        formula: UNI_TEST,
        test: 'University Entry Test',
        minInter: 60,
        shifts: ['MORNING', 'EVENING'],
      }),
      p('BS Information Technology', {
        closing: 81.9,
        fee: 42000,
        seats: 100,
        formula: UNI_TEST,
        test: 'University Entry Test',
        minInter: 55,
      }),
      p('BS Mathematics', {
        closing: 76.3,
        fee: 32000,
        seats: 80,
        fieldGroup: 'Sciences',
        groups: ['Pre-Engineering', 'ICS'],
        formula: NO_TEST,
      }),
      p('BS Physics', {
        closing: 72.1,
        fee: 32000,
        seats: 60,
        fieldGroup: 'Sciences',
        groups: ['Pre-Engineering'],
        formula: NO_TEST,
      }),
      p('BS Chemistry', {
        closing: 74.6,
        fee: 32000,
        seats: 60,
        fieldGroup: 'Sciences',
        groups: ['Pre-Engineering', 'Pre-Medical'],
        formula: NO_TEST,
        latestDraft: true,
      }),
      p('BS Botany', {
        closing: 70.2,
        fee: 30000,
        seats: 60,
        fieldGroup: 'Sciences',
        groups: ['Pre-Medical'],
        formula: NO_TEST,
        years_of_data: 1,
      }),
    ],
  },
  {
    name: 'Frontier University of Engineering',
    shortName: 'FUE',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Peshawar',
    province: 'Khyber Pakhtunkhwa',
    website: 'https://fue.example.edu.pk',
    about: 'Sample public engineering university in Peshawar.',
    campuses: [
      { name: 'Main Campus', city: 'Peshawar' },
      { name: 'Mardan Campus', city: 'Mardan' },
    ],
    months: [7, 8],
    programs: [
      p('BS Civil Engineering', {
        closing: 80.4,
        fee: 46000,
        seats: 150,
        formula: ENGG,
        test: 'ETEA Engineering',
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        minInter: 60,
      }),
      p('BS Electrical Engineering', {
        closing: 81.6,
        fee: 46000,
        seats: 150,
        formula: ENGG,
        test: 'ETEA Engineering',
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        minInter: 60,
      }),
      p('BS Computer Systems Engineering', {
        closing: 82.3,
        fee: 46000,
        seats: 80,
        formula: ENGG,
        test: 'ETEA Engineering',
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        minInter: 60,
      }),
      p('BS Computer Science', {
        closing: 79.2,
        fee: 40000,
        seats: 100,
        formula: UNI_TEST,
        test: 'ETEA Engineering',
        minInter: 55,
      }),
    ],
  },
  {
    name: 'Bolan Plateau University',
    shortName: 'BPU',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Quetta',
    province: 'Balochistan',
    website: 'https://bpu.example.edu.pk',
    about: 'Sample public university in Quetta with arts, sciences and computing.',
    campuses: [{ name: 'Sariab Road Campus', city: 'Quetta' }],
    months: [8, 9],
    programs: [
      p('BS Computer Science', { closing: 68.5, fee: 28000, seats: 80, formula: NO_TEST }),
      p('BS English', {
        closing: 61.3,
        fee: 22000,
        seats: 60,
        fieldGroup: 'Arts and Humanities',
        groups: ANY,
        formula: NO_TEST,
        minInter: 45,
      }),
      p('BS Economics', {
        closing: 63.7,
        fee: 22000,
        seats: 60,
        fieldGroup: 'Social Sciences',
        groups: ANY,
        formula: NO_TEST,
        minInter: 45,
      }),
      p('BS Geology', {
        closing: 60.8,
        fee: 24000,
        seats: 40,
        fieldGroup: 'Sciences',
        groups: ['Pre-Engineering', 'Pre-Medical'],
        formula: NO_TEST,
        minInter: 45,
        years_of_data: 2,
      }),
    ],
  },
  {
    name: 'Chenab Valley College',
    shortName: 'CVC',
    type: 'COLLEGE',
    sector: 'PRIVATE',
    city: 'Gujranwala',
    province: 'Punjab',
    website: 'https://cvc.example.edu.pk',
    about: 'Sample private college offering associate and BS programs in Gujranwala.',
    campuses: [{ name: 'GT Road Campus', city: 'Gujranwala' }],
    months: [8, 9],
    programs: [
      p('BS Computer Science', { closing: 66.4, fee: 55000, seats: 80, formula: NO_TEST, minInter: 45 }),
      p('Associate Degree in Computer Science', {
        degreeLevel: 'ASSOCIATE',
        years: 2,
        closing: 58.9,
        fee: 40000,
        seats: 60,
        formula: NO_TEST,
        minInter: 45,
      }),
      p('BS Commerce', {
        closing: 60.2,
        fee: 45000,
        seats: 100,
        fieldGroup: 'Business',
        groups: ANY,
        formula: NO_TEST,
        minInter: 45,
      }),
      p('Associate Degree in Commerce', {
        degreeLevel: 'ASSOCIATE',
        years: 2,
        closing: 55.4,
        fee: 35000,
        seats: 100,
        fieldGroup: 'Business',
        groups: ANY,
        formula: NO_TEST,
        minInter: 40,
      }),
    ],
  },
  {
    name: 'Karakoram Highlands College',
    shortName: 'KHC',
    type: 'COLLEGE',
    sector: 'PUBLIC',
    city: 'Gilgit',
    province: 'Gilgit-Baltistan',
    website: 'https://khc.example.edu.pk',
    about: 'Sample public degree college in Gilgit.',
    campuses: [{ name: 'Konodas Campus', city: 'Gilgit' }],
    months: [8, 9],
    programs: [
      p('BS Computer Science', { closing: 62.7, fee: 18000, seats: 50, formula: NO_TEST, minInter: 45 }),
      p('BS Tourism and Hospitality', {
        closing: 57.5,
        fee: 18000,
        seats: 50,
        fieldGroup: 'Business',
        groups: ANY,
        formula: NO_TEST,
        minInter: 40,
        years_of_data: 1,
      }),
    ],
  },
  {
    name: 'Sialkot Institute of Applied Technology',
    shortName: 'SIAT',
    type: 'INSTITUTE',
    sector: 'PRIVATE',
    city: 'Sialkot',
    province: 'Punjab',
    website: 'https://siat.example.edu.pk',
    about: 'Sample private institute focused on applied engineering technology.',
    campuses: [{ name: 'Daska Road Campus', city: 'Sialkot' }],
    months: [8, 9, 10],
    programs: [
      p('BS Software Engineering', { closing: 70.8, fee: 78000, seats: 60, formula: NO_TEST }),
      p('BS Electrical Engineering Technology', {
        closing: 63.9,
        fee: 70000,
        seats: 80,
        groups: ['Pre-Engineering', 'ICS'],
        fieldGroup: 'Engineering',
        formula: NO_TEST,
        minInter: 45,
      }),
      p('BS Mechanical Engineering Technology', {
        closing: 61.4,
        fee: 70000,
        seats: 80,
        groups: ['Pre-Engineering'],
        fieldGroup: 'Engineering',
        formula: NO_TEST,
        minInter: 45,
        latestDraft: true,
      }),
    ],
  },
  {
    name: 'Sutlej Institute of Technology',
    shortName: 'SIT',
    type: 'INSTITUTE',
    sector: 'PUBLIC',
    city: 'Bahawalpur',
    province: 'Punjab',
    website: 'https://sit.example.edu.pk',
    about: 'Sample public institute of technology in Bahawalpur.',
    campuses: [{ name: 'Main Campus', city: 'Bahawalpur' }],
    months: [8, 9],
    programs: [
      p('BS Computer Science', {
        closing: 73.4,
        fee: 36000,
        seats: 100,
        formula: UNI_TEST,
        test: 'University Entry Test',
        shifts: ['MORNING', 'EVENING'],
      }),
      p('BS Agricultural Engineering', {
        closing: 67.9,
        fee: 34000,
        seats: 60,
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        formula: ENGG,
        test: 'ECAT',
        minInter: 60,
      }),
      p('BS Information Technology', { closing: 70.1, fee: 36000, seats: 80 }),
    ],
  },
  {
    name: 'Multan Sun City University',
    shortName: 'MSCU',
    type: 'UNIVERSITY',
    sector: 'PRIVATE',
    city: 'Multan',
    province: 'Punjab',
    website: 'https://mscu.example.edu.pk',
    about: 'Sample private university in Multan.',
    campuses: [{ name: 'Bosan Road Campus', city: 'Multan' }],
    months: [7, 8, 9],
    programs: [
      p('BS Computer Science', {
        closing: 69.8,
        fee: 82000,
        seats: 120,
        formula: NO_TEST,
        shifts: ['MORNING', 'EVENING'],
      }),
      p('BS Psychology', {
        closing: 66.1,
        fee: 70000,
        seats: 60,
        fieldGroup: 'Social Sciences',
        groups: ANY,
        formula: NO_TEST,
        minInter: 45,
      }),
      p('Doctor of Pharmacy (Pharm-D)', {
        years: 5,
        closing: 83.4,
        fee: 135000,
        seats: 100,
        fieldGroup: 'Health Sciences',
        groups: ['Pre-Medical'],
        formula: NO_TEST,
        minInter: 60,
      }),
      p('BS Nutrition and Dietetics', {
        closing: 71.2,
        fee: 90000,
        seats: 50,
        fieldGroup: 'Health Sciences',
        groups: ['Pre-Medical'],
        formula: NO_TEST,
        minInter: 55,
      }),
    ],
  },
  {
    name: 'Pothohar Institute of Management',
    shortName: 'PIM',
    type: 'INSTITUTE',
    sector: 'PRIVATE',
    city: 'Rawalpindi',
    province: 'Punjab',
    website: 'https://pim.example.edu.pk',
    about: 'Sample private business school in Rawalpindi.',
    campuses: [{ name: 'Saddar Campus', city: 'Rawalpindi' }],
    months: [6, 7, 8],
    programs: [
      p('BBA (Hons)', {
        closing: 69.4,
        fee: 115000,
        seats: 150,
        fieldGroup: 'Business',
        groups: ANY,
        formula: UNI_TEST,
        test: 'PIM Aptitude Test',
        shifts: ['MORNING', 'EVENING'],
      }),
      p('BS Accounting and Finance', {
        closing: 67.2,
        fee: 112000,
        seats: 80,
        fieldGroup: 'Business',
        groups: ANY,
        formula: UNI_TEST,
        test: 'PIM Aptitude Test',
      }),
      p('BS Economics and Data Analytics', {
        closing: 71.6,
        fee: 118000,
        seats: 50,
        fieldGroup: 'Social Sciences',
        groups: ['Pre-Engineering', 'ICS', 'I.Com'],
        formula: UNI_TEST,
        test: 'PIM Aptitude Test',
      }),
    ],
  },
  {
    name: 'Kirthar Range University',
    shortName: 'KRU',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Hyderabad',
    province: 'Sindh',
    website: 'https://kru.example.edu.pk',
    about: 'Sample public university in Hyderabad.',
    campuses: [{ name: 'Jamshoro Road Campus', city: 'Hyderabad' }],
    months: [8, 9],
    programs: [
      p('BS Computer Science', {
        closing: 75.6,
        fee: 30000,
        seats: 120,
        formula: UNI_TEST,
        test: 'Pre-Admission Test',
      }),
      p('BS Software Engineering', {
        closing: 74.2,
        fee: 30000,
        seats: 80,
        formula: UNI_TEST,
        test: 'Pre-Admission Test',
      }),
      p('BS Chemical Engineering', {
        closing: 76.8,
        fee: 34000,
        seats: 60,
        groups: ENG_GROUPS,
        fieldGroup: 'Engineering',
        formula: ENGG,
        test: 'Pre-Admission Test',
        minInter: 60,
      }),
    ],
  },
  {
    name: 'Neelum Valley University',
    shortName: 'NVU',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Muzaffarabad',
    province: 'Azad Jammu and Kashmir',
    website: 'https://nvu.example.edu.pk',
    about: 'Sample public university in Muzaffarabad.',
    campuses: [{ name: 'Chehla Campus', city: 'Muzaffarabad' }],
    months: [8, 9],
    programs: [
      p('BS Computer Science', { closing: 67.3, fee: 26000, seats: 60, formula: NO_TEST }),
      p('BS Environmental Sciences', {
        closing: 60.1,
        fee: 24000,
        seats: 50,
        fieldGroup: 'Sciences',
        groups: ['Pre-Engineering', 'Pre-Medical'],
        formula: NO_TEST,
        minInter: 45,
        years_of_data: 0,
      }),
    ],
  },
  {
    name: 'Northern Science College Rawalpindi',
    shortName: 'NSCR',
    type: 'COLLEGE',
    sector: 'PRIVATE',
    city: 'Rawalpindi',
    province: 'Punjab',
    website: '',
    about: 'Older directory listing entered from a published prospectus before the college joined ADMITRA.',
    campuses: [{ name: 'Murree Road', city: 'Rawalpindi' }],
    months: [8],
    programs: [
      p('Intermediate Pre-Engineering (FSc)', {
        degreeLevel: 'INTERMEDIATE',
        years: 2,
        closing: 81.4,
        fee: 18000,
        seats: 200,
        fieldGroup: 'Sciences',
        groups: ANY,
        formula: [{ component: 'MATRIC', weight: 100 }],
        minInter: 0,
      }),
    ],
  },
];

/** Deterministic pseudo-random numbers so that the sample data is the same on every run. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
