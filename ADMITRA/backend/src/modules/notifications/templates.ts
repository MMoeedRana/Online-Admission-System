/** NOTIF-2 / NOTIF-3: e-mail templates with their default wording and variables. */
export const TEMPLATE_VARIABLES = [
  'applicantName',
  'institutionName',
  'applicationNumber',
  'programName',
  'campaignName',
  'amount',
  'receiptNumber',
  'note',
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
    body: 'Dear {{applicantName}},\n\nCongratulations! You are selected for {{programName}} at {{institutionName}}. Please accept the offer before the deadline.',
  },
  WAITLISTED: {
    name: 'Waiting list',
    subject: 'You are on the waiting list of {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nYou are on the waiting list for {{programName}} at {{institutionName}}. You will be informed when the next merit list is published.',
  },
  MERIT_RESULT: {
    name: 'Merit list result',
    subject: 'Merit list published by {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nA merit list of {{campaignName}} has been published. Open "Where is my name?" in your dashboard to see your result.',
  },
  ENROLLED: {
    name: 'Enrollment confirmed',
    subject: 'Welcome to {{institutionName}}',
    body: 'Dear {{applicantName}},\n\nYour enrollment in {{programName}} is confirmed. Your registration number and admission letter are available in your dashboard.',
  },
};

export type TemplateKey = keyof typeof DEFAULT_TEMPLATES;

export function renderTemplate(text: string, vars: Record<string, string | number | undefined>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (vars[k] === undefined ? '' : String(vars[k])));
}
