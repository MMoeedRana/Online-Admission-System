import { DEFAULT_BRAND, PlatformSettingsModel, assetUrl } from '../modules/branding/branding.models';
import { logger } from './logger';

let current = { ...DEFAULT_BRAND, logoUrl: '', faviconUrl: '', updatedAt: new Date(0) as Date };

export function brand() {
  return current;
}

export async function loadBrand() {
  try {
    const s = await PlatformSettingsModel.findById('platform').lean();
    current = {
      platformName: s?.platformName || DEFAULT_BRAND.platformName,
      tagline: s?.tagline ?? DEFAULT_BRAND.tagline,
      agentName: s?.agentName || DEFAULT_BRAND.agentName,
      primaryColor: s?.primaryColor || DEFAULT_BRAND.primaryColor,
      sidebarColor: s?.sidebarColor || DEFAULT_BRAND.sidebarColor,
      avatarColor: s?.avatarColor ?? '',
      logoUrl: assetUrl(s?.logoKey),
      faviconUrl: assetUrl(s?.faviconKey),
      updatedAt: s?.updatedAt ?? new Date(0),
    };
  } catch (err) {
    logger.warn({ err }, 'Could not load the platform branding; using the defaults');
  }
  return current;
}
