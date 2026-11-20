import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Types } from 'mongoose';
import { fileStore } from '../lib/file-store';
import { assetUrl, PlatformSettingsModel, PublicAssetModel } from '../modules/branding/branding.models';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { UserModel } from '../modules/users/user.model';
import { runDailyBriefings } from '../modules/agent/briefing.service';
import { refreshAlerts } from '../modules/agent/integrity.rules';
import { PaymentModel, VoucherModel } from '../modules/fees/fee.models';
import { PlanModel } from '../modules/plans/plan.model';
import { SubscriptionPaymentModel } from '../modules/platform/billing.model';
import { RecordModel, VerificationModel } from '../modules/records/record.models';

import { logger } from '../lib/logger';

const DAY = 24 * 3600_000;

const log = (msg: string) => console.log(`  ${msg}`);
const ASSETS = path.join(__dirname, 'assets');

async function storeImage(file: string, kind: 'INSTITUTION_LOGO' | 'AVATAR', ownerId: Types.ObjectId) {
  const buf = fs.readFileSync(path.join(ASSETS, file));
  const key = crypto.randomBytes(16).toString('hex');
  const storageKey = `public/${key}.png`;
  await fileStore().put(storageKey, buf, 'image/png');
  await PublicAssetModel.create({ key, kind, ownerId, storageKey, mimeType: 'image/png', size: buf.length });
  return key;
}

async function seedBranding() {
  await PlatformSettingsModel.updateOne({ _id: 'platform' }, { $setOnInsert: {} }, { upsert: true });
  const cvu = await InstitutionModel.findOne({ shortName: 'CVU' });
  const rit = await InstitutionModel.findOne({ shortName: 'RIT' });
  if (cvu) {
    const key = await storeImage('cvu-logo.png', 'INSTITUTION_LOGO', cvu._id);
    await InstitutionModel.updateOne(
      { _id: cvu._id },
      { $set: { 'branding.logoKey': key, 'branding.logoUrl': assetUrl(key) } },
    );
  }
  if (rit) {
    const key = await storeImage('rit-logo.png', 'INSTITUTION_LOGO', rit._id);
    await InstitutionModel.updateOne(
      { _id: rit._id },
      {
        $set: {
          'branding.logoKey': key,
          'branding.logoUrl': assetUrl(key),
          'branding.primaryColor': '#0F766E',
          'branding.sidebarColor': '#0B2B2E',
        },
      },
    );
  }
  const ayesha = await UserModel.findOne({ email: 'ayesha.noor@example.com' });
  if (ayesha) {
    ayesha.avatarKey = await storeImage('avatar-ayesha.png', 'AVATAR', ayesha._id);
    await ayesha.save();
  }
  log('Branding: platform defaults, CVU and RIT logos, RIT teal colours, a profile picture for Ayesha Noor');
}

async function seedAssistantData() {
  const now = Date.now();
  const admin = await UserModel.findOne({ platformRole: 'SUPER_ADMIN' }).lean();
  const insts = await InstitutionModel.find({ status: 'ACTIVE' }).lean();
  let fees = 0;
  for (const [i, inst] of insts.entries()) {
    const plan = await PlanModel.findById(inst.planId).lean();
    if (!plan) continue;
    const paidAt = new Date(now - (40 + i * 9) * DAY);
    await SubscriptionPaymentModel.create({
      institutionId: inst._id,
      planId: plan._id,
      planName: plan.name,
      months: 12,
      amount: plan.priceMonthly * 12,
      method: i % 2 ? 'CHEQUE' : 'BANK_TRANSFER',
      reference: `PF-${2026}-${String(101 + i)}`,
      periodStart: paidAt,
      periodEnd: new Date(paidAt.getTime() + 365 * DAY),
      recordedBy: admin?._id ?? null,
      recordedByName: admin?.fullName ?? '',
      createdAt: paidAt,
    });
    fees++;
  }
  await InstitutionModel.updateOne(
    { shortName: 'MCU' },
    { $set: { 'subscription.endsAt': new Date(now + 12 * DAY) } },
  );
  await InstitutionModel.updateOne(
    { shortName: 'NSC' },
    { $set: { 'subscription.endsAt': new Date(now - 2 * DAY) } },
  );

  const rit = insts.find((x) => x.shortName === 'RIT');
  if (rit) {
    const p = await PaymentModel.findOne({ institutionId: rit._id, status: 'VERIFIED' }).sort({
      decidedAt: -1,
    });
    const v = p ? await VoucherModel.findById(p.voucherId).lean() : null;
    if (p && v) {
      p.amount = v.amount - 5000;
      p.decidedAt = new Date(now - 2 * DAY);
      await p.save();
    }
  }
  const cvu = insts.find((x) => x.shortName === 'CVU');
  const officer = await UserModel.findOne({ email: 'officer@cvu.example.edu.pk' }).lean();
  const rec = await RecordModel.findOne({ verificationStatus: 'MISMATCH', current: true }).lean();
  if (cvu && rec)
    await VerificationModel.create({
      recordId: rec._id,
      userId: rec.userId,
      institutionId: cvu._id,
      method: 'OFFICER',
      status: 'VERIFIED',
      diff: rec.registryDiff?.length
        ? rec.registryDiff
        : [{ field: 'obtained', entered: rec.obtained, official: rec.obtained - 40 }],
      note: 'Accepted after a phone call with the applicant.',
      decidedBy: officer?._id ?? null,
      createdAt: new Date(now - DAY),
    });
  const alerts = await refreshAlerts({ days: 30 });
  const briefings = await runDailyBriefings();
  log(
    `Assistant: ${fees} platform fee payments, MCU ending in 12 days, NSC in grace, ${alerts.length} integrity finding(s), ${briefings} briefing(s) for today`,
  );
}

export async function seedPhase5() {
  const level = logger.level;
  logger.level = 'warn';
  try {
    await seedBranding();
    await seedAssistantData();
  } finally {
    logger.level = level;
  }
}
