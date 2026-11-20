export const TEMPLATE_VARIABLES = [
  'applicantName',
  'institutionName',
  'applicationNumber',
  'programName',
  'campaignName',
  'amount',
  'receiptNumber',
  'note',
  'listNumber',
  'position',
  'aggregate',
  'deadline',
  'registrationNumber',
] as const;

export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  APPLICATION_SUBMITTED: {
    name: 'Application submitted',
    subject: 'Application {{applicationNumber}} received',
    body: 'Dear {{applicantName}},\n\nYour application {{applicationNumber}} to {{institutionName}} for {{campaignName}} has been submitted.\n\nPlease pay the application fee of {{amount}} using the challan in your dashboard and upload the proof of payment.',
  },
  PAYMENT_VERIFIED: {
    name: 'Payment verified',
    subject: 'Payment verified for {{applicationNumber}}',
    body: 'Dear {{applicantName}},\n\nYour payment of {{amount}} for application {{applicationNumber}} has been verified. Receipt number: {{receiptNumber}}.\n\nYour application is now under review.',
  },
  PAYMENT_REJECTED: {
    name: 'Payment rejected',
    subject: 'Payment proof not accepted for {{applicationNumber}}',
    body: 'Dear {{applicantName}},\n\nThe proof of payment for application {{applicationNumber}} could not be verified.\n\nReason: {{note}}\n\nPlease upload a correct proof of payment.',
  },
  DEFICIENCY_NOTICE: {
    name: 'Deficiency notice',
    subject: 'Action needed on application {{applicationNumber}}',
    body: 'Dear {{applicantName}},\n\n{{institutionName}} needs corrections in your application {{applicationNumber}}:\n\n{{note}}\n\nPlease replace the rejected documents or correct your marks and resubmit.',
  },
  MARKS_VERIFIED: {
    name: 'Marks verified',
    subject: 'Your marks have been verified',
    body: 'Dear {{applicantName}},\n\nYour academic record has been verified by {{institutionName}} and is now locked.',
  },
  MARKS_MISMATCH: {
    name: 'Marks mismatch',
    subject: 'Your marks need correction',
    body: 'Dear {{applicantName}},\n\nThe marks you entered do not match the official result.\n\n{{note}}\n\nPlease correct your academic record or upload a clear result card. False marks lead to rejection or cancellation of admission.',
  },
  APPLICATION_VERIFIED: {
    name: 'Application verified',
    subject: 'Application {{applicationNumber}} verified',
    body: 'Dear {{applicantName}},\n\nYour application {{applicationNumber}} to {{institutionName}} has been verified. It will be considered in the merit list.',
  },
  APPLICATION_REJECTED: {
    name: 'Application rejected',
    subject: 'Application {{applicationNumber}} not accepted',
    body: 'Dear {{applicantName}},\n\nYour application {{applicationNumber}} to {{institutionName}} was not accepted.\n\nReason: {{note}}',
  },
  OFFER_ISSUED: {
    name: 'Admission offer',
    subject: 'Admission offer from {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nCongratulations! Your name is in merit list {{listNumber}} of {{institutionName}} for {{programName}} (merit position {{position}}, aggregate {{aggregate}}).\n\nPlease accept the offer and pay the admission fee before {{deadline}}. An offer that is not accepted by the deadline expires.',
  },
  WAITLISTED: {
    name: 'Waiting list',
    subject: 'You are on the waiting list of {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nYou are at position {{position}} on the waiting list for {{programName}} at {{institutionName}} (merit list {{listNumber}}, aggregate {{aggregate}}).\n\nYou will be informed when the next merit list is published.',
  },
  MERIT_RESULT: {
    name: 'Merit list result',
    subject: 'Merit list {{listNumber}} published by {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nMerit list {{listNumber}} of {{campaignName}} has been published. Your name is not in this list (aggregate {{aggregate}}).\n\nOpen "Where is my name?" in your dashboard to see the cut-off and other programs suggested by the Admission Advisor.',
  },
  ENROLLED: {
    name: 'Enrollment confirmed',
    subject: 'Welcome to {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nYour enrollment in {{programName}} at {{institutionName}} is confirmed. Your registration number is {{registrationNumber}}.\n\nDownload your admission letter from your dashboard.',
  },
  OFFER_EXPIRED: {
    name: 'Offer expired',
    subject: 'Your admission offer has expired',
    body: 'Dear {{applicantName}},\n\nYour admission offer for {{programName}} at {{institutionName}} was not accepted and paid by the deadline, so it has expired and the seat has been released.',
  },
  ADMISSION_REVOKED: {
    name: 'Admission revoked',
    subject: 'Admission to {{institutionName}} revoked',
    body: 'Dear {{applicantName}},\n\nYour admission to {{programName}} at {{institutionName}} (application {{applicationNumber}}) has been revoked.\n\nReason: {{note}}\n\nPlease contact the admission office if you have questions.',
  },
};

export type TemplateKey = keyof typeof DEFAULT_TEMPLATES;

export function renderTemplate(text: string, vars: Record<string, string | number | undefined>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (vars[k] === undefined ? '' : String(vars[k])));
}
