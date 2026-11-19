import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { amountInWords } from './words';

const NAVY = '#0B1B3A';
const BLUE = '#1F6FEB';
const MUTED = '#64748B';
const LINE = '#CBD5E1';

const money = (n: number) => `Rs. ${new Intl.NumberFormat('en-PK').format(n)}`;
const date = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(d),
      )
    : '-';

function send(res: Response, doc: PDFKit.PDFDocument, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  doc.end();
}

export interface ChallanData {
  institution: {
    name: string;
    city: string;
    bankAccount: { bankName: string; accountTitle: string; accountNumber: string; iban: string };
  };
  voucherNumber: string;
  type: 'APPLICATION' | 'ADMISSION';
  issuedAt: Date;
  dueDate: Date;
  applicant: { name: string; fatherName: string; cnic: string };
  applicationNumber: string;
  campaign: string;
  items: { label: string; amount: number }[];
  amount: number;
}

/** FEE-2: three copies (bank, institution, applicant) on one landscape A4 page. */
export function challanPdf(res: Response, d: ChallanData) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 24,
    info: { Title: `Challan ${d.voucherNumber}` },
  });
  const copies = ['Bank copy', 'Institution copy', 'Applicant copy'];
  const W = (doc.page.width - 48 - 2 * 16) / 3;
  copies.forEach((copy, i) => {
    const x = 24 + i * (W + 16);
    let y = 24;
    doc
      .save()
      .roundedRect(x, y, W, doc.page.height - 48, 8)
      .lineWidth(0.8)
      .strokeColor(LINE)
      .stroke()
      .restore();
    doc.rect(x, y, W, 46).fill(NAVY);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(d.institution.name, x + 10, y + 9, { width: W - 20 });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text(
        `${d.type === 'APPLICATION' ? 'Application' : 'Admission'} fee challan  |  ${copy}`,
        x + 10,
        y + 30,
        { width: W - 20 },
      );
    y += 56;
    const row = (label: string, value: string, bold = false) => {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(7.5)
        .text(label.toUpperCase(), x + 10, y, { width: W - 20 });
      y += 10;
      doc
        .fillColor('#0F172A')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9.5)
        .text(value || '-', x + 10, y, { width: W - 20 });
      y = doc.y + 6;
    };
    row('Challan number', d.voucherNumber, true);
    row('Bank', d.institution.bankAccount.bankName);
    row('Account title', d.institution.bankAccount.accountTitle);
    row(
      'Account number / IBAN',
      [d.institution.bankAccount.accountNumber, d.institution.bankAccount.iban].filter(Boolean).join('  /  '),
    );
    row('Applicant', d.applicant.name);
    row("Father's name", d.applicant.fatherName);
    row('CNIC / B-Form', d.applicant.cnic);
    row('Application number', `${d.applicationNumber}  (${d.campaign})`);
    row('Issued / due date', `${date(d.issuedAt)}  /  ${date(d.dueDate)}`);
    y += 2;
    doc
      .moveTo(x + 10, y)
      .lineTo(x + W - 10, y)
      .strokeColor(LINE)
      .stroke();
    y += 6;
    for (const it of d.items) {
      doc
        .fillColor('#0F172A')
        .font('Helvetica')
        .fontSize(8.5)
        .text(it.label, x + 10, y, { width: W - 90 });
      doc.text(money(it.amount), x + W - 90, y, { width: 80, align: 'right' });
      y = doc.y + 3;
    }
    y += 4;
    doc.rect(x + 10, y, W - 20, 24).fill('#EEF4FF');
    doc
      .fillColor(BLUE)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Total', x + 18, y + 7);
    doc.text(money(d.amount), x + W - 110, y + 7, { width: 92, align: 'right' });
    y += 30;
    doc
      .fillColor(MUTED)
      .font('Helvetica-Oblique')
      .fontSize(8)
      .text(`Amount in words: ${amountInWords(d.amount)}`, x + 10, y, { width: W - 20 });
    const bottom = doc.page.height - 24 - 70;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        'Pay at any branch of the bank before the due date, then upload the paid slip in ADMITRA. The payment counts only after verification by the finance office.',
        x + 10,
        bottom - 34,
        { width: W - 20 },
      );
    doc
      .moveTo(x + 10, bottom + 40)
      .lineTo(x + W / 2 - 6, bottom + 40)
      .strokeColor(LINE)
      .stroke();
    doc
      .moveTo(x + W / 2 + 6, bottom + 40)
      .lineTo(x + W - 10, bottom + 40)
      .stroke();
    doc.fontSize(7.5).text('Depositor signature', x + 10, bottom + 44);
    doc.text('Bank stamp and signature', x + W / 2 + 6, bottom + 44);
  });
  send(res, doc, `challan-${d.voucherNumber}.pdf`);
}

/** FEE-5: payment receipt. */
export function receiptPdf(
  res: Response,
  d: {
    institution: string;
    receiptNumber: string;
    voucherNumber: string;
    applicationNumber: string;
    applicant: string;
    cnic: string;
    amount: number;
    method: string;
    reference: string;
    paidOn: Date;
    verifiedAt: Date;
    verifiedBy: string;
  },
) {
  const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receipt ${d.receiptNumber}` } });
  doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(d.institution, 36, 22, { width: doc.page.width - 72 });
  doc.font('Helvetica').fontSize(9).text('Payment receipt', 36, 44);
  doc.moveDown(3);
  doc.y = 92;
  const rows: [string, string][] = [
    ['Receipt number', d.receiptNumber],
    ['Challan number', d.voucherNumber],
    ['Application number', d.applicationNumber],
    ['Applicant', d.applicant],
    ['CNIC / B-Form', d.cnic],
    ['Amount', `${money(d.amount)}  (${amountInWords(d.amount)})`],
    ['Payment method', d.method.replace(/_/g, ' ')],
    ['Transaction / slip reference', d.reference],
    ['Paid on', date(d.paidOn)],
    ['Verified on', `${date(d.verifiedAt)} by ${d.verifiedBy}`],
  ];
  for (const [k, v] of rows) {
    const y = doc.y;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(k, 36, y, { width: 120 });
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(v, 160, y, { width: doc.page.width - 196 });
    doc.moveDown(0.6);
  }
  doc.moveDown(1).fillColor('#16A34A').font('Helvetica-Bold').fontSize(12).text('PAID', { align: 'center' });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text('This receipt was generated by ADMITRA after verification by the finance office.', {
      align: 'center',
    });
  send(res, doc, `receipt-${d.receiptNumber}.pdf`);
}

/** Printable copy of a submitted application. */
export function applicationPdf(
  res: Response,
  d: {
    institution: string;
    applicationNumber: string;
    campaign: string;
    submittedAt: Date | null;
    status: string;
    profile: Record<string, unknown>;
    preferences: { order: number; program: string; shift: string }[];
    records: {
      level: string;
      board: string;
      year: number;
      rollNo: string;
      obtained: number;
      total: number;
      percentage: number;
      trust: string;
    }[];
  },
) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: { Title: `Application ${d.applicationNumber}` },
  });
  doc.rect(0, 0, doc.page.width, 80).fill(NAVY);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text(d.institution, 40, 24);
  doc.font('Helvetica').fontSize(10).text(`Application form  |  ${d.campaign}`, 40, 48);
  doc.y = 100;
  const heading = (t: string) => {
    doc.moveDown(0.8).fillColor(BLUE).font('Helvetica-Bold').fontSize(11).text(t);
    doc
      .moveTo(40, doc.y + 2)
      .lineTo(doc.page.width - 40, doc.y + 2)
      .strokeColor(LINE)
      .stroke();
    doc.moveDown(0.5);
  };
  const kv = (k: string, v: unknown) => {
    const y = doc.y;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(k, 40, y, { width: 150 });
    doc
      .fillColor('#0F172A')
      .font('Helvetica')
      .fontSize(9.5)
      .text(String(v ?? '-') || '-', 200, y, { width: doc.page.width - 240 });
    doc.moveDown(0.35);
  };
  kv('Application number', d.applicationNumber);
  kv('Submitted on', date(d.submittedAt));
  kv('Status', d.status.replace(/_/g, ' '));
  heading('Personal information');
  const p = d.profile;
  kv('Full name', p.fullName);
  kv("Father's name", p.fatherName);
  kv('CNIC / B-Form', p.cnic);
  kv('Date of birth', date(p.dateOfBirth as string));
  kv('Gender', p.gender);
  kv('Phone', p.phone);
  kv('Domicile', p.domicile);
  heading('Program preferences');
  d.preferences.forEach((x) => kv(`Preference ${x.order}`, `${x.program} (${x.shift.toLowerCase()} shift)`));
  heading('Academic record');
  d.records.forEach((r) =>
    kv(
      `${r.level.replace(/_/g, ' ')} ${r.year}`,
      `${r.board}, roll no. ${r.rollNo}: ${r.obtained}/${r.total} (${r.percentage}%), ${r.trust}`,
    ),
  );
  doc
    .moveDown(2)
    .fillColor(MUTED)
    .fontSize(8)
    .text(
      'I declare that the information given in this application is correct. False information leads to rejection or cancellation of admission.',
      40,
    );
  send(res, doc, `application-${d.applicationNumber}.pdf`);
}
