import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Types } from 'mongoose';
import { STORAGE_ROOT } from '../lib/storage';
import { assetUrl, PlatformSettingsModel, PublicAssetModel } from '../modules/branding/branding.models';
import { InstitutionModel } from '../modules/institutions/institution.model';
import { UserModel } from '../modules/users/user.model';

const log = (msg: string) => console.log(`  ${msg}`);
const ASSETS = path.join(__dirname, 'assets');

async function storeImage(file: string, kind: 'INSTITUTION_LOGO' | 'AVATAR', ownerId: Types.ObjectId) {
  const buf = fs.readFileSync(path.join(ASSETS, file));
  const key = crypto.randomBytes(16).toString('hex');
  const storageKey = path.join('public', `${key}.png`);
  await fs.promises.mkdir(path.join(STORAGE_ROOT, 'public'), { recursive: true });
  await fs.promises.writeFile(path.join(STORAGE_ROOT, storageKey), buf);
  await PublicAssetModel.create({ key, kind, ownerId, storageKey, mimeType: 'image/png', size: buf.length });
  return key;
}

/** BRAND-1 to BRAND-4: default platform branding, two institution logos, RIT colours and a profile picture. */
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

export async function seedPhase5() {
  await seedBranding();
}
