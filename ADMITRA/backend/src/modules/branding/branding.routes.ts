import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../lib/audit';
import { brand, loadBrand } from '../../lib/brand';
import { ApiError, ok } from '../../lib/http';
import { upload } from '../../lib/storage';
import { parse } from '../../lib/validate';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { requirePermission } from '../../middleware/tenant';
import { InstitutionModel } from '../institutions/institution.model';
import { planOf } from '../institutions/limits';
import { UserModel, publicUser } from '../users/user.model';
import { removePublicImage, savePublicImage, streamPublicImage } from './assets';
import { assetUrl, DEFAULT_BRAND, PlatformSettingsModel } from './branding.models';

const color = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, `Choose the ${label} as a hex colour such as #1A62D6.`);

export const assetRouter = Router();
assetRouter.get('/:key', async (req, res) => {
  await streamPublicImage(res, String(req.params.key));
});

export const publicBrandingRouter = Router();
publicBrandingRouter.get('/branding', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  ok(res, brand());
});

export const platformBrandingRouter = Router();
platformBrandingRouter.use(authenticate, requireSuperAdmin);

platformBrandingRouter.get('/', async (_req, res) => {
  ok(res, { ...(await loadBrand()), defaults: DEFAULT_BRAND });
});

platformBrandingRouter.patch('/', async (req, res) => {
  const b = parse(
    z.object({
      platformName: z.string().trim().min(2, 'Enter the platform name.').max(40).optional(),
      tagline: z.string().trim().max(120).optional(),
      agentName: z.string().trim().min(2, 'Enter the assistant name.').max(24).optional(),
      primaryColor: color('primary colour').optional(),
      sidebarColor: color('sidebar colour').optional(),
      avatarColor: color('initials colour').or(z.literal('')).optional(),
    }),
    req.body,
  );
  await PlatformSettingsModel.updateOne(
    { _id: 'platform' },
    { $set: { ...b, updatedBy: req.auth!.userId } },
    { upsert: true, runValidators: true },
  );
  await audit(req, 'PLATFORM_BRANDING_UPDATED', 'PlatformSettings', 'platform', b);
  ok(res, await loadBrand());
});

for (const [slot, kind, field] of [
  ['logo', 'PLATFORM_LOGO', 'logoKey'],
  ['favicon', 'FAVICON', 'faviconKey'],
] as const) {
  platformBrandingRouter.post(`/${slot}`, upload.single('file'), async (req, res) => {
    const asset = await savePublicImage(req.file, kind, null);
    const old = await PlatformSettingsModel.findById('platform').lean();
    await PlatformSettingsModel.updateOne(
      { _id: 'platform' },
      { $set: { [field]: asset.key, updatedBy: req.auth!.userId } },
      { upsert: true },
    );
    await removePublicImage(old?.[field]);
    await audit(req, `PLATFORM_${slot.toUpperCase()}_UPLOADED`, 'PlatformSettings', 'platform', {
      size: asset.size,
    });
    ok(res, await loadBrand());
  });
  platformBrandingRouter.delete(`/${slot}`, async (req, res) => {
    const old = await PlatformSettingsModel.findById('platform').lean();
    await PlatformSettingsModel.updateOne({ _id: 'platform' }, { $set: { [field]: '' } }, { upsert: true });
    await removePublicImage(old?.[field]);
    await audit(req, `PLATFORM_${slot.toUpperCase()}_REMOVED`, 'PlatformSettings', 'platform');
    ok(res, await loadBrand());
  });
}

platformBrandingRouter.post('/reset-colors', async (req, res) => {
  await PlatformSettingsModel.updateOne(
    { _id: 'platform' },
    {
      $set: {
        primaryColor: DEFAULT_BRAND.primaryColor,
        sidebarColor: DEFAULT_BRAND.sidebarColor,
        avatarColor: '',
      },
    },
    { upsert: true },
  );
  await audit(req, 'PLATFORM_BRANDING_RESET', 'PlatformSettings', 'platform');
  ok(res, await loadBrand());
});

export const institutionBrandingRouter = Router();
institutionBrandingRouter.use(requirePermission(PERMISSIONS.INSTITUTION_SETTINGS));

async function requireBrandingPlan(inst: Parameters<typeof planOf>[0]) {
  const plan = await planOf(inst);
  if (!plan.features?.customBranding)
    throw new ApiError(403, 'PLAN_FEATURE', `Custom branding is not included in the ${plan.name} plan.`);
}

institutionBrandingRouter.get('/', async (req, res) => {
  const plan = await planOf(req.tenant!.institution);
  const inst = await InstitutionModel.findById(req.tenant!.institutionId).select('branding').lean();
  ok(res, { ...inst?.branding, active: Boolean(plan.features?.customBranding), planName: plan.name });
});

institutionBrandingRouter.post('/logo', upload.single('file'), async (req, res) => {
  await requireBrandingPlan(req.tenant!.institution);
  const asset = await savePublicImage(req.file, 'INSTITUTION_LOGO', req.tenant!.institutionId);
  const old = await InstitutionModel.findById(req.tenant!.institutionId).select('branding').lean();
  await InstitutionModel.updateOne(
    { _id: req.tenant!.institutionId },
    { $set: { 'branding.logoKey': asset.key, 'branding.logoUrl': assetUrl(asset.key) } },
  );
  await removePublicImage(old?.branding?.logoKey);
  await audit(req, 'INSTITUTION_LOGO_UPLOADED', 'Institution', req.tenant!.institutionId, {
    size: asset.size,
  });
  ok(res, { logoUrl: assetUrl(asset.key) });
});

institutionBrandingRouter.delete('/logo', async (req, res) => {
  const old = await InstitutionModel.findById(req.tenant!.institutionId).select('branding').lean();
  await InstitutionModel.updateOne(
    { _id: req.tenant!.institutionId },
    { $set: { 'branding.logoKey': '', 'branding.logoUrl': '' } },
  );
  await removePublicImage(old?.branding?.logoKey);
  await audit(req, 'INSTITUTION_LOGO_REMOVED', 'Institution', req.tenant!.institutionId);
  ok(res, { logoUrl: '' });
});

export const avatarRouter = Router();
avatarRouter.use(authenticate);
avatarRouter.post('/', upload.single('file'), async (req, res) => {
  const asset = await savePublicImage(req.file, 'AVATAR', req.auth!.userId);
  const user = await UserModel.findById(req.auth!.userId);
  if (!user) throw ApiError.unauthorized();
  const old = user.avatarKey;
  user.avatarKey = asset.key;
  await user.save();
  await removePublicImage(old);
  ok(res, { user: publicUser(user) });
});
avatarRouter.delete('/', async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId);
  if (!user) throw ApiError.unauthorized();
  const old = user.avatarKey;
  user.avatarKey = '';
  await user.save();
  await removePublicImage(old);
  ok(res, { user: publicUser(user) });
});
