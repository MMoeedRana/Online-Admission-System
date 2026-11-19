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

function header(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.rect(0, 0, doc.page.width, 78).fill(NAVY);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(title, 40, 22, { width: doc.page.width - 80 });
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#C7D7F5')
    .text(subtitle, 40, 46, { width: doc.page.width - 80 });
  doc.fillColor('#0F172A');
  doc.y = 100;
}

function footer(doc: PDFKit.PDFDocument, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`${text}  |  Page ${i + 1} of ${range.count}`, 40, doc.page.height - 30, {
        width: doc.page.width - 80,
        align: 'center',
        lineBreak: false,
      });
  }
}

export interface LetterData {
  institution: { name: string; city: string; address: string };
  registrationNumber: string;
  applicationNumber: string;
  applicant: { name: string; fatherName: string; cnic: string };
  program: string;
  shift: string;
  campaign: string;
  meritPosition: number;
  aggregate: number;
  enrolledAt: Date;
}

/** OFFER-4: admission letter with the registration number. */
export function admissionLetterPdf(res: Response, d: LetterData) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Admission letter ${d.registrationNumber}` },
  });
  header(doc, d.institution.name, `${d.institution.address || d.institution.city}  |  Office of Admissions`);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text('Admission Letter', 40, 110);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(`Date: ${date(d.enrolledAt)}`, 40, 114, { align: 'right' });
  doc.moveDown(1.2);
  doc.fontSize(11).fillColor('#0F172A').text(`Dear ${d.applicant.name},`, 40);
  doc.moveDown(0.6);
  doc
    .fontSize(10.5)
    .text(
      `We are pleased to confirm your admission to ${d.program} (${d.shift.toLowerCase()} shift) for ${d.campaign}. ` +
        'Your admission fee has been received and your enrollment is complete.',
      { align: 'justify', lineGap: 3 },
    );
  doc.moveDown(1);
  const top = doc.y;
  doc.roundedRect(40, top, doc.page.width - 80, 168, 8).fillAndStroke('#F5F8FF', LINE);
  let y = top + 14;
  const rows: [string, string][] = [
    ['Registration number', d.registrationNumber],
    ['Application number', d.applicationNumber],
    ['Name', d.applicant.name],
    ["Father's name", d.applicant.fatherName],
    ['CNIC / B-Form', d.applicant.cnic],
    ['Program and shift', `${d.program}  (${d.shift.toLowerCase()})`],
    ['Merit position / aggregate', `${d.meritPosition}  /  ${d.aggregate.toFixed(2)}`],
  ];
  for (const [k, v] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k.toUpperCase(), 56, y, { width: 170 });
    doc
      .font(k === 'Registration number' ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10.5)
      .fillColor('#0F172A')
      .text(v, 230, y - 1, { width: doc.page.width - 290 });
    y += 21;
  }
  doc.y = top + 184;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Next steps', 40);
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#0F172A')
    .list(
      [
        'Keep this letter and your registration number for all correspondence.',
        'Report to your department on the first day of classes with your original documents.',
        'Admission is subject to the rules of the institution and may be cancelled if any information is found to be false.',
      ],
      { bulletRadius: 2, textIndent: 12, lineGap: 3 },
    );
  doc.moveDown(3);
  doc.font('Helvetica-Bold').fontSize(10).text('Director Admissions', 40);
  doc.font('Helvetica').fillColor(MUTED).text(d.institution.name);
  footer(
    doc,
    `Generated by ADMITRA. Verify this letter with the admission office using registration number ${d.registrationNumber}`,
  );
  send(res, doc, `${d.registrationNumber}.pdf`);
}

export interface MeritListPdfData {
  institution: string;
  campaign: string;
  listNumber: number;
  revision: number;
  publishedAt: Date | null;
  pools: {
    title: string;
    shift: string;
    seats: number;
    closing: number | null;
    entries: {
      position: number;
      name: string;
      applicationNumber: string;
      aggregate: number;
      outcome: string;
      waiting?: number | null;
    }[];
  }[];
}

/** FIND-6 / OFFER-5: public merit list with shortened names; CNICs are never printed. */
export function meritListPdf(res: Response, d: MeritListPdfData) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Merit list ${d.listNumber}` },
  });
  header(
    doc,
    `${d.institution}: merit list ${d.listNumber}${d.revision > 1 ? ` (revision ${d.revision})` : ''}`,
    `${d.campaign}  |  Published ${date(d.publishedAt)}`,
  );
  const cols = [40, 90, 270, 400, 470];
  for (const pool of d.pools) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(NAVY)
      .text(`${pool.title} (${pool.shift.toLowerCase()})`, 40);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `Seats ${pool.seats}  |  Closing aggregate ${pool.closing == null ? '-' : pool.closing.toFixed(2)}`,
        40,
      );
    doc.moveDown(0.4);
    let y = doc.y;
    doc.rect(40, y, doc.page.width - 80, 18).fill('#EEF2F8');
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8);
    ['No.', 'Name', 'Application', 'Aggregate', 'Result'].forEach((h, i) => doc.text(h, cols[i]! + 6, y + 5));
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor('#0F172A');
    for (const e of pool.entries) {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }
      doc.text(String(e.position), cols[0]! + 6, y);
      doc.text(e.name, cols[1]! + 6, y, { width: 170 });
      doc.text(e.applicationNumber, cols[2]! + 6, y);
      doc.text(e.aggregate.toFixed(2), cols[3]! + 6, y);
      const r =
        e.outcome === 'SELECTED'
          ? 'Selected'
          : e.outcome === 'WAITLISTED'
            ? `Waiting ${e.waiting ?? ''}`
            : 'Not selected';
      doc
        .fillColor(e.outcome === 'SELECTED' ? '#15803D' : e.outcome === 'WAITLISTED' ? '#B45309' : MUTED)
        .text(r, cols[4]! + 6, y);
      doc.fillColor('#0F172A');
      y += 16;
      doc
        .moveTo(40, y - 3)
        .lineTo(doc.page.width - 40, y - 3)
        .strokeColor('#EEF2F8')
        .stroke();
    }
    doc.y = y + 4;
  }
  footer(doc, 'Names are shortened and CNIC numbers are never published (OFFER-5). Generated by ADMITRA');
  send(res, doc, `merit-list-${d.listNumber}.pdf`);
}

export interface ShortlistPdfData {
  name: string;
  basis: string;
  rows: {
    program: string;
    institution: string;
    fee: number;
    lastClosing: number | null;
    aggregate: number | null;
    chance: number | null;
    band: string;
    years: string;
  }[];
}

const BAND_TEXT: Record<string, string> = {
  SAFE: 'Safe',
  TARGET: 'Target',
  REACH: 'Reach',
  UNLIKELY: 'Unlikely',
  INSUFFICIENT_DATA: 'Insufficient data',
  NOT_ELIGIBLE: 'Not eligible',
};

/** PRED-10: the applicant's shortlist with chances, as a PDF. */
export function shortlistPdf(res: Response, d: ShortlistPdfData) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 40,
    bufferPages: true,
    info: { Title: 'My shortlist' },
  });
  header(
    doc,
    `Shortlist of ${d.name}`,
    `ADMITRA Admission Advisor  |  ${date(new Date())}  |  Based on ${d.basis === 'VERIFIED' ? 'verified marks' : 'self-declared marks'}`,
  );
  const cols = [40, 250, 460, 540, 610, 680, 740];
  const heads = ['Program', 'Institution', 'Fee / sem.', 'Last closing', 'Your aggregate', 'Chance', 'Class'];
  let y = doc.y;
  doc.rect(40, y, doc.page.width - 80, 20).fill('#EEF2F8');
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5);
  heads.forEach((h, i) => doc.text(h, cols[i]! + 6, y + 6));
  y += 24;
  for (const r of d.rows) {
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = 50;
    }
    doc.font('Helvetica').fontSize(9.5).fillColor('#0F172A');
    doc.text(r.program, cols[0]! + 6, y, { width: 200 });
    doc.text(r.institution, cols[1]! + 6, y, { width: 200 });
    doc.text(money(r.fee), cols[2]! + 6, y);
    doc.text(r.lastClosing == null ? '-' : r.lastClosing.toFixed(2), cols[3]! + 6, y);
    doc.text(r.aggregate == null ? '-' : r.aggregate.toFixed(2), cols[4]! + 6, y);
    doc.text(r.chance == null ? '-' : `${r.chance}%`, cols[5]! + 6, y);
    doc.font('Helvetica-Bold').text(BAND_TEXT[r.band] ?? r.band, cols[6]! + 6, y);
    y += 26;
    doc
      .moveTo(40, y - 6)
      .lineTo(doc.page.width - 40, y - 6)
      .strokeColor('#EEF2F8')
      .stroke();
  }
  doc.moveDown(1);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      'Chances are statistical estimates from the closing merit of the last three years (verified data only). They are not a guarantee of admission.',
      40,
      y + 6,
      { width: doc.page.width - 80 },
    );
  footer(doc, 'Generated by ADMITRA');
  send(res, doc, 'shortlist.pdf');
}
