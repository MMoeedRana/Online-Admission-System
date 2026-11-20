import { Router } from 'express';
import { enrollAfterPayment, notifyEnrollment } from '../merit/offer.service';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { nextSeq, pad } from '../../lib/counter';
import { withTransaction } from '../../lib/db';
import { ApiError, ok } from '../../lib/http';
import { escapeRegex, pageMeta, paginationQuery } from '../../lib/pagination';
import { receiptPdf } from '../../lib/pdf';
import { idParams, parse } from '../../lib/validate';
import { requirePermission } from '../../middleware/tenant';
import { ApplicationModel } from '../applications/application.model';
import { receiptData } from '../applications/applicant.routes';
import { pushHistory, type AppDoc } from '../applications/application.service';
import { InstitutionModel } from '../institutions/institution.model';
import { notify } from '../notifications/notify';
import { UserModel } from '../users/user.model';
import { PaymentModel, VoucherModel } from './fee.models';

export const paymentRouter = Router();
paymentRouter.use(requirePermission(PERMISSIONS.PAYMENTS_VERIFY));

const listQuery = paginationQuery.extend({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional() });

export async function rows(institutionId: string, q: z.infer<typeof listQuery>, all = false) {
  const filter: Record<string, unknown> = { institutionId };
  if (q.status) filter.status = q.status;
  if (q.q) filter.reference = { $regex: escapeRegex(q.q.toUpperCase()) };
  const query = PaymentModel.find(filter).sort({ status: 1, createdAt: -1 });
  if (!all) query.skip((q.page - 1) * q.limit).limit(q.limit);
  const items = await query.lean();
  const [apps, vouchers] = await Promise.all([
    ApplicationModel.find({ _id: { $in: items.map((p) => p.applicationId) } })
      .select('applicationNumber snapshot.profile.fullName')
      .lean(),
    VoucherModel.find({ _id: { $in: items.map((p) => p.voucherId) } })
      .select('voucherNumber amount')
      .lean(),
  ]);
  return {
    items: items.map((p) => {
      const app = apps.find((a) => String(a._id) === String(p.applicationId));
      const v = vouchers.find((x) => String(x._id) === String(p.voucherId));
      return {
        ...p,
        applicationNumber: app?.applicationNumber,
        applicantName: (app?.snapshot?.profile as { fullName?: string })?.fullName ?? '',
        voucherNumber: v?.voucherNumber,
        challanAmount: v?.amount,
        checks: { amountMatches: v?.amount === p.amount, uniqueReference: true },
      };
    }),
    total: await PaymentModel.countDocuments(filter),
  };
}

paymentRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const r = await rows(req.tenant!.institutionId, q);
  const pending = await PaymentModel.countDocuments({
    institutionId: req.tenant!.institutionId,
    status: 'PENDING',
  });
  ok(res, r.items, { ...pageMeta(q.page, q.limit, r.total), pending });
});

/** FEE-5: payments CSV for reconciliation with the bank statement. */
paymentRouter.get('/export.csv', async (req, res) => {
  const q = parse(listQuery, req.query);
  const r = await rows(req.tenant!.institutionId, q, true);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = [
    'Application',
    'Applicant',
    'Challan',
    'Method',
    'Reference',
    'Amount',
    'Paid on',
    'Status',
    'Receipt',
    'Decided by',
    'Decided at',
  ];
  const lines = r.items.map((p) =>
    [
      p.applicationNumber,
      p.applicantName,
      p.voucherNumber,
      p.method,
      p.reference,
      p.amount,
      p.paidOn?.toISOString().slice(0, 10),
      p.status,
      p.receiptNumber,
      p.decidedByName,
      p.decidedAt?.toISOString(),
    ]
      .map(esc)
      .join(','),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
  res.send('﻿' + [header.map(esc).join(','), ...lines].join('\n'));
});

paymentRouter.get('/:id/receipt.pdf', async (req, res) => {
  const { id } = parse(idParams, req.params);
  if (!(await PaymentModel.exists({ _id: id, institutionId: req.tenant!.institutionId })))
    throw ApiError.notFound('Receipt');
  receiptPdf(res, await receiptData(id));
});

/** FEE-4: a payment is counted only after verification and can be decided only once. */
paymentRouter.post('/:id/decision', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(
    z.object({ decision: z.enum(['VERIFIED', 'REJECTED']), reason: z.string().trim().max(500).default('') }),
    req.body,
  );
  if (body.decision === 'REJECTED' && body.reason.length < 5)
    throw ApiError.validation('Write the reason for rejection.', {
      fields: { reason: 'A reason is required.' },
    });
  const t = req.tenant!;
  const inst = await InstitutionModel.findById(t.institutionId).select('shortName name').lean();

  const result = await withTransaction(async (session) => {
    const pay = await PaymentModel.findOne({ _id: id, institutionId: t.institutionId }).session(session);
    if (!pay) throw ApiError.notFound('Payment');
    if (pay.status !== 'PENDING') throw ApiError.conflict('This payment has already been decided.');
    const voucher = await VoucherModel.findById(pay.voucherId).session(session);
    const app = (await ApplicationModel.findById(pay.applicationId).session(session)) as AppDoc;
    pay.status = body.decision;
    pay.reason = body.reason;
    pay.set('decidedBy', req.auth!.userId);
    pay.decidedByName = req.auth!.name;
    pay.decidedAt = new Date();
    if (body.decision === 'VERIFIED') {
      const year = new Date().getFullYear();
      pay.receiptNumber = `RCPT-${inst!.shortName}-${year}-${pad(await nextSeq(`receipt:${t.institutionId}:${year}`, session), 6)}`;
      voucher!.status = 'PAID';
      if (voucher!.type === 'APPLICATION' && app.status === 'PAYMENT_PENDING')
        pushHistory(app, 'UNDER_REVIEW', 'SYSTEM', undefined, `Fee verified, receipt ${pay.receiptNumber}`);
    } else {
      voucher!.status = 'ISSUED';
    }
    await pay.save({ session });
    await voucher!.save({ session });
    await app.save({ session });
    // Table 3.14, step 5: a verified admission fee enrolls the applicant.
    const enrollment =
      body.decision === 'VERIFIED' && voucher!.type === 'ADMISSION'
        ? await enrollAfterPayment(voucher!._id, session)
        : null;
    return { pay, app, enrollment, voucherType: voucher!.type };
  });

  await audit(req, `PAYMENT_${body.decision}`, 'Payment', id, {
    reason: body.reason,
    receipt: result.pay.receiptNumber,
  });
  const user = await UserModel.findById(result.app.applicantId).select('email').lean();
  const vars = {
    applicantName: (result.app.snapshot?.profile as { fullName?: string })?.fullName,
    institutionName: inst!.name,
    applicationNumber: result.app.applicationNumber ?? '',
    amount: `Rs. ${result.pay.amount}`,
    receiptNumber: result.pay.receiptNumber ?? '',
    note: body.reason,
  };
  const link = `/applicant/applications/${result.app._id}`;
  if (body.decision === 'VERIFIED') {
    await notify(
      result.app.applicantId,
      {
        type: 'PAYMENT_VERIFIED',
        title: 'Payment verified',
        body:
          result.voucherType === 'ADMISSION'
            ? `Admission fee received, receipt ${result.pay.receiptNumber}.`
            : `Receipt ${result.pay.receiptNumber} issued. Your application is under review.`,
        link,
      },
      { to: user!.email, key: 'PAYMENT_VERIFIED', institutionId: t.institutionId, vars },
    );
  } else {
    await notify(
      result.app.applicantId,
      { type: 'PAYMENT_REJECTED', title: 'Payment proof not accepted', body: body.reason, link },
      { to: user!.email, key: 'PAYMENT_REJECTED', institutionId: t.institutionId, vars },
    );
  }
  if (result.enrollment) await notifyEnrollment(result.enrollment._id);
  ok(res, result.pay);
});
