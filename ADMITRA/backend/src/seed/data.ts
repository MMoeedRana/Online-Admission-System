/**
 * Sample data for development and demonstration only.
 * Institution names match the reference UI designs; they are not real institutions.
 */
export const SAMPLE_PASSWORD = 'Admitra@123';

export const plans = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'For colleges with one campus.',
    priceMonthly: 15000,
    trialDays: 30,
    limits: { campuses: 1, programs: 20, staff: 10, applicationsPerCycle: 2000 },
    features: { multipleCampuses: false, customBranding: false, advancedAnalytics: false, apiAccess: false },
  },
  {
    code: 'STANDARD',
    name: 'Standard',
    description: 'For universities with several campuses.',
    priceMonthly: 35000,
    trialDays: 30,
    limits: { campuses: 3, programs: 80, staff: 40, applicationsPerCycle: 10000 },
    features: { multipleCampuses: true, customBranding: true, advancedAnalytics: true, apiAccess: false },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'For large universities with many campuses.',
    priceMonthly: 75000,
    trialDays: 45,
    limits: { campuses: 10, programs: 400, staff: 250, applicationsPerCycle: 60000 },
    features: { multipleCampuses: true, customBranding: true, advancedAnalytics: true, apiAccess: true },
  },
] as const;

type ProgramSeed = {
  title: string;
  code: string;
  degreeLevel: 'INTERMEDIATE' | 'BS' | 'MS' | 'ASSOCIATE';
  fieldGroup: string;
  dept: string;
  years: number;
  shifts: { name: 'MORNING' | 'EVENING'; seats: number }[];
  minInter: number;
  groups: string[];
  test?: string;
  appFee: number;
  admFee: number;
};

export interface InstitutionSeed {
  name: string;
  shortName: string;
  type: 'UNIVERSITY' | 'COLLEGE' | 'INSTITUTE';
  sector: 'PUBLIC' | 'PRIVATE';
  city: string;
  province: 'Punjab' | 'Islamabad Capital Territory';
  website: string;
  about: string;
  plan: 'STARTER' | 'STANDARD' | 'ENTERPRISE';
  admin: { name: string; email: string };
  staff: { name: string; email: string; roles: string[]; designation: string; depts?: string[] }[];
  campuses: { name: string; code: string; city: string; address: string }[];
  faculties: { name: string; code: string; departments: { name: string; code: string }[] }[];
  programs: ProgramSeed[];
  campaign: { title: string; code: string; daysOpen: number; daysLeft: number; status: 'OPEN' | 'DRAFT' };
}

const cs = (dept: string, extra: Partial<ProgramSeed> = {}): ProgramSeed => ({
  title: 'BS Computer Science',
  code: 'BSCS',
  degreeLevel: 'BS',
  fieldGroup: 'Computing',
  dept,
  years: 4,
  shifts: [
    { name: 'MORNING', seats: 120 },
    { name: 'EVENING', seats: 60 },
  ],
  minInter: 50,
  groups: ['Pre-Engineering', 'ICS', 'Pre-Medical (with Mathematics)'],
  test: 'University Entry Test',
  appFee: 2500,
  admFee: 65000,
  ...extra,
});

export const institutions: InstitutionSeed[] = [
  {
    name: 'Crescent Valley University',
    shortName: 'CVU',
    type: 'UNIVERSITY',
    sector: 'PUBLIC',
    city: 'Faisalabad',
    province: 'Punjab',
    website: 'https://cvu.example.edu.pk',
    about:
      'Sample public university used for the ADMITRA demonstration. It offers undergraduate and graduate programs in computing, engineering, sciences and management.',
    plan: 'STANDARD',
    admin: { name: 'Maryam Iqbal', email: 'admin@cvu.example.edu.pk' },
    staff: [
      {
        name: 'Usman Tariq',
        email: 'officer@cvu.example.edu.pk',
        roles: ['ADMISSION_OFFICER'],
        designation: 'Admission Officer',
      },
      {
        name: 'Dr. Nadia Saleem',
        email: 'hod.cs@cvu.example.edu.pk',
        roles: ['HOD_OFFICER'],
        designation: 'Head of Computer Science',
        depts: ['CS'],
      },
      {
        name: 'Kamran Shah',
        email: 'finance@cvu.example.edu.pk',
        roles: ['FINANCE_OFFICER'],
        designation: 'Finance Officer',
      },
      {
        name: 'Prof. Asif Mehmood',
        email: 'merit1@cvu.example.edu.pk',
        roles: ['MERIT_COMMITTEE'],
        designation: 'Merit Committee Convener',
      },
      {
        name: 'Dr. Sana Javed',
        email: 'merit2@cvu.example.edu.pk',
        roles: ['MERIT_COMMITTEE'],
        designation: 'Merit Committee Member',
      },
    ],
    campuses: [
      { name: 'Main Campus', code: 'MAIN', city: 'Faisalabad', address: 'Jail Road, Faisalabad' },
      { name: 'City Campus', code: 'CITY', city: 'Faisalabad', address: 'Susan Road, Faisalabad' },
    ],
    faculties: [
      {
        name: 'Faculty of Computing',
        code: 'FOC',
        departments: [
          { name: 'Computer Science', code: 'CS' },
          { name: 'Software Engineering', code: 'SE' },
          { name: 'Information Technology', code: 'IT' },
        ],
      },
      {
        name: 'Faculty of Management Sciences',
        code: 'FMS',
        departments: [{ name: 'Business Administration', code: 'BBA' }],
      },
      { name: 'Faculty of Sciences', code: 'FOS', departments: [{ name: 'Mathematics', code: 'MATH' }] },
    ],
    programs: [
      cs('CS'),
      {
        ...cs('SE'),
        title: 'BS Software Engineering',
        code: 'BSSE',
        shifts: [{ name: 'MORNING', seats: 100 }],
      },
      {
        ...cs('CS'),
        title: 'BS Artificial Intelligence',
        code: 'BSAI',
        shifts: [{ name: 'MORNING', seats: 60 }],
        admFee: 70000,
      },
      {
        ...cs('IT'),
        title: 'BS Information Technology',
        code: 'BSIT',
        shifts: [
          { name: 'MORNING', seats: 80 },
          { name: 'EVENING', seats: 40 },
        ],
        admFee: 60000,
      },
      {
        title: 'BBA (Hons)',
        code: 'BBA',
        degreeLevel: 'BS',
        fieldGroup: 'Management',
        dept: 'BBA',
        years: 4,
        shifts: [{ name: 'MORNING', seats: 100 }],
        minInter: 45,
        groups: [],
        appFee: 2000,
        admFee: 55000,
      },
      {
        title: 'BS Mathematics',
        code: 'BSMATH',
        degreeLevel: 'BS',
        fieldGroup: 'Sciences',
        dept: 'MATH',
        years: 4,
        shifts: [{ name: 'MORNING', seats: 60 }],
        minInter: 45,
        groups: ['Pre-Engineering', 'ICS'],
        appFee: 2000,
        admFee: 45000,
      },
      {
        title: 'MS Computer Science',
        code: 'MSCS',
        degreeLevel: 'MS',
        fieldGroup: 'Computing',
        dept: 'CS',
        years: 2,
        shifts: [{ name: 'EVENING', seats: 30 }],
        minInter: 0,
        groups: [],
        test: 'GAT General',
        appFee: 3000,
        admFee: 80000,
      },
    ],
    campaign: { title: 'Fall 2026', code: 'F26', daysOpen: 20, daysLeft: 11, status: 'OPEN' },
  },
  {
    name: 'Riverside Institute of Technology',
    shortName: 'RIT',
    type: 'INSTITUTE',
    sector: 'PRIVATE',
    city: 'Lahore',
    province: 'Punjab',
    website: 'https://rit.example.edu.pk',
    about: 'Sample private institute of technology used for the ADMITRA demonstration.',
    plan: 'STANDARD',
    admin: { name: 'Hassan Raza', email: 'admin@rit.example.edu.pk' },
    staff: [
      {
        name: 'Fatima Zahid',
        email: 'officer@rit.example.edu.pk',
        roles: ['ADMISSION_OFFICER', 'FINANCE_OFFICER'],
        designation: 'Admissions and Accounts',
      },
    ],
    campuses: [{ name: 'Main Campus', code: 'MAIN', city: 'Lahore', address: 'Ferozepur Road, Lahore' }],
    faculties: [
      {
        name: 'Faculty of Engineering and Computing',
        code: 'FEC',
        departments: [
          { name: 'Computing', code: 'COMP' },
          { name: 'Electrical Engineering', code: 'EE' },
        ],
      },
    ],
    programs: [
      {
        ...cs('COMP'),
        title: 'BS Information Technology',
        code: 'BSIT',
        shifts: [{ name: 'MORNING', seats: 90 }],
        admFee: 85000,
        appFee: 3000,
      },
      {
        ...cs('COMP'),
        title: 'BS Data Science',
        code: 'BSDS',
        shifts: [{ name: 'MORNING', seats: 50 }],
        admFee: 95000,
        appFee: 3000,
      },
      {
        title: 'BS Electrical Engineering',
        code: 'BSEE',
        degreeLevel: 'BS',
        fieldGroup: 'Engineering',
        dept: 'EE',
        years: 4,
        shifts: [{ name: 'MORNING', seats: 60 }],
        minInter: 60,
        groups: ['Pre-Engineering'],
        test: 'ECAT',
        appFee: 3000,
        admFee: 110000,
      },
    ],
    campaign: { title: 'Fall 2026', code: 'F26', daysOpen: 15, daysLeft: 21, status: 'OPEN' },
  },
  {
    name: 'Metro City University',
    shortName: 'MCU',
    type: 'UNIVERSITY',
    sector: 'PRIVATE',
    city: 'Islamabad',
    province: 'Islamabad Capital Territory',
    website: 'https://mcu.example.edu.pk',
    about: 'Sample private university in the federal capital used for the ADMITRA demonstration.',
    plan: 'ENTERPRISE',
    admin: { name: 'Ali Haider', email: 'admin@mcu.example.edu.pk' },
    staff: [],
    campuses: [{ name: 'H-8 Campus', code: 'H8', city: 'Islamabad', address: 'Sector H-8, Islamabad' }],
    faculties: [
      {
        name: 'Faculty of Computing and AI',
        code: 'FCAI',
        departments: [
          { name: 'Artificial Intelligence', code: 'AI' },
          { name: 'Computer Science', code: 'CS' },
        ],
      },
    ],
    programs: [
      {
        ...cs('AI'),
        title: 'BS Artificial Intelligence',
        code: 'BSAI',
        shifts: [{ name: 'MORNING', seats: 80 }],
        admFee: 120000,
        appFee: 3500,
        minInter: 60,
      },
      { ...cs('CS'), shifts: [{ name: 'MORNING', seats: 120 }], admFee: 115000, appFee: 3500, minInter: 60 },
    ],
    campaign: { title: 'Fall 2026', code: 'F26', daysOpen: 10, daysLeft: 28, status: 'OPEN' },
  },
  {
    name: 'Northern Science College',
    shortName: 'NSC',
    type: 'COLLEGE',
    sector: 'PUBLIC',
    city: 'Rawalpindi',
    province: 'Punjab',
    website: 'https://nsc.example.edu.pk',
    about: 'Sample public college offering intermediate and associate degree programs.',
    plan: 'STARTER',
    admin: { name: 'Rabia Anwar', email: 'admin@nsc.example.edu.pk' },
    staff: [],
    campuses: [{ name: 'Main Campus', code: 'MAIN', city: 'Rawalpindi', address: 'Murree Road, Rawalpindi' }],
    faculties: [
      {
        name: 'Faculty of Science',
        code: 'FSC',
        departments: [
          { name: 'Computer Science', code: 'CS' },
          { name: 'Pre-Medical and Pre-Engineering', code: 'FSC' },
        ],
      },
    ],
    programs: [
      {
        ...cs('CS'),
        title: 'BS Data Science',
        code: 'BSDS',
        shifts: [{ name: 'MORNING', seats: 40 }],
        admFee: 30000,
        appFee: 1000,
        test: undefined,
      },
      {
        title: 'Associate Degree in Computer Science',
        code: 'ADCS',
        degreeLevel: 'ASSOCIATE',
        fieldGroup: 'Computing',
        dept: 'CS',
        years: 2,
        shifts: [{ name: 'MORNING', seats: 50 }],
        minInter: 45,
        groups: ['ICS', 'Pre-Engineering'],
        appFee: 800,
        admFee: 20000,
      },
      {
        title: 'FSc Pre-Engineering',
        code: 'FSCPE',
        degreeLevel: 'INTERMEDIATE',
        fieldGroup: 'Engineering',
        dept: 'FSC',
        years: 2,
        shifts: [{ name: 'MORNING', seats: 200 }],
        minInter: 0,
        groups: [],
        appFee: 500,
        admFee: 8000,
      },
    ],
    campaign: { title: 'Fall 2026', code: 'F26', daysOpen: 5, daysLeft: 0, status: 'DRAFT' },
  },
];

export const pendingRequests = [
  {
    name: 'Lakeside College of Commerce',
    shortName: 'LCC',
    type: 'COLLEGE' as const,
    sector: 'PRIVATE' as const,
    city: 'Sargodha',
    province: 'Punjab' as const,
    website: 'https://lcc.example.edu.pk',
    contact: {
      name: 'Imran Khalid',
      designation: 'Principal',
      email: 'principal@lcc.example.edu.pk',
      phone: '0300-1234567',
    },
    about: 'We would like to run our Fall 2026 admissions on ADMITRA.',
  },
];

export const sampleApplicant = { name: 'Ayesha Noor', email: 'ayesha.noor@example.com' };
