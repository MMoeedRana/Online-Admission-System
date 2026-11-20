import { Schema, Types, model } from 'mongoose';

export const ASSET_KINDS = ['PLATFORM_LOGO', 'FAVICON', 'INSTITUTION_LOGO', 'AVATAR'] as const;

const assetSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ASSET_KINDS, required: true },
    ownerId: { type: Types.ObjectId, default: null, index: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);
export const PublicAssetModel = model('PublicAsset', assetSchema);

export const HEX = /^#[0-9A-Fa-f]{6}$/;
export const DEFAULT_BRAND = {
  platformName: 'ADMITRA',
  tagline: 'One profile. Every college and university.',
  agentName: 'Mitra',
  primaryColor: '#1A62D6',
  sidebarColor: '#0B1B3A',
  avatarColor: '',
};

const platformSettingsSchema = new Schema(
  {
    _id: { type: String, default: 'platform' },
    platformName: { type: String, default: DEFAULT_BRAND.platformName, trim: true, maxlength: 40 },
    tagline: { type: String, default: DEFAULT_BRAND.tagline, trim: true, maxlength: 120 },
    agentName: { type: String, default: DEFAULT_BRAND.agentName, trim: true, maxlength: 24 },
    logoKey: { type: String, default: '' },
    faviconKey: { type: String, default: '' },
    primaryColor: { type: String, default: DEFAULT_BRAND.primaryColor, match: HEX },
    sidebarColor: { type: String, default: DEFAULT_BRAND.sidebarColor, match: HEX },
    avatarColor: { type: String, default: '' },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
export const PlatformSettingsModel = model('PlatformSettings', platformSettingsSchema);

export const assetUrl = (key?: string | null) => (key ? `/api/v1/assets/${key}` : '');
