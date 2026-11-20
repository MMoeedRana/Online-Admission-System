export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
] as const;

export const INSTITUTION_TYPES = ['UNIVERSITY', 'COLLEGE', 'INSTITUTE'] as const;
export const SECTORS = ['PUBLIC', 'PRIVATE'] as const;
export const INSTITUTION_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;

export const DEGREE_LEVELS = ['INTERMEDIATE', 'DIPLOMA', 'ASSOCIATE', 'BS', 'MS', 'MPHIL', 'PHD'] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const QUALIFICATION_LEVELS = [
  'MATRIC',
  'INTERMEDIATE',
  'BACHELOR_14',
  'BACHELOR_16',
  'MASTER',
  'ENTRY_TEST',
] as const;

export const SHIFTS = ['MORNING', 'EVENING', 'WEEKEND'] as const;

export const CAMPAIGN_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['CLOSED'],
  CLOSED: ['OPEN', 'ARCHIVED'],
  ARCHIVED: [],
};

export const FEE_POLICIES = ['HIGHEST', 'SUM'] as const;
export const DUPLICATE_POLICIES = ['ONE_ACTIVE', 'ALLOW_MULTIPLE'] as const;
export const LATE_POLICIES = ['REFUSE', 'ALLOW'] as const;
