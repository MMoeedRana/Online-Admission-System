/**
 * BRAND-5: turns the colours chosen by the Super Admin or an institution into a full set of
 * design tokens that always keep WCAG 2.2 AA contrast (4.5:1 for text), in light and dark themes.
 * Any colour can be picked; it is darkened or lightened only as much as contrast requires.
 */
export interface Brand {
  platformName: string;
  tagline: string;
  agentName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  sidebarColor: string;
  avatarColor: string;
}

export const DEFAULT_BRAND: Brand = {
  platformName: 'ADMITRA',
  tagline: 'One profile. Every college and university.',
  agentName: 'Mitra',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#1A62D6',
  sidebarColor: '#0B1B3A',
  avatarColor: '',
};

type RGB = [number, number, number];
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbToHex = (c: RGB) => `#${c.map((x) => clamp(x).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** Mixes `a` towards `b` (t = 0 gives a, t = 1 gives b). */
export const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t] as RGB);
};
/** Moves a colour towards black or white in small steps until it reaches the contrast it needs. */
function until(hex: string, target: 'black' | 'white', ok: (c: string) => boolean) {
  let c = hex;
  for (let i = 0; i <= 40 && !ok(c); i++) c = mix(hex, target === 'black' ? '#000000' : '#FFFFFF', i / 40);
  return c;
}

const LIGHT = { page: '#F5F7FB', card: '#FFFFFF' };
const DARK = { page: '#0A1226', card: '#0F1A33', soft: '#13203D' };

/** Every token derived from the two brand colours. */
export function palette(primaryColor: string, sidebarColor: string) {
  const base = isHex(primaryColor) ? primaryColor : DEFAULT_BRAND.primaryColor;
  // Fill colour: white text on it must reach 4.5:1.
  const primary = until(base, 'black', (c) => contrast(c, '#FFFFFF') >= 4.6);
  const softLight = mix(primary, '#FFFFFF', 0.9);
  // Primary used as text on light surfaces (page, card and its own soft tint).
  const textLight = until(primary, 'black', (c) => contrast(c, softLight) >= 4.6 && contrast(c, LIGHT.page) >= 4.6);
  const softDark = mix(primary, DARK.card, 0.78);
  // In the dark theme the text colour is a lighter version that reads on dark surfaces.
  const textDark = until(
    base,
    'white',
    (c) => contrast(c, DARK.card) >= 4.8 && contrast(c, softDark) >= 4.6 && contrast(c, DARK.soft) >= 4.6,
  );
  const sideBase = isHex(sidebarColor) ? sidebarColor : DEFAULT_BRAND.sidebarColor;
  // The sidebar stays dark enough for its light text (slate-300 needs 4.5:1, white about 10:1).
  const navy = until(sideBase, 'black', (c) => contrast(c, '#FFFFFF') >= 11 && contrast(c, '#CBD5E1') >= 6.5);
  const [r, g, b] = hexToRgb(primary);
  return {
    light: {
      '--primary': primary,
      '--primary-hover': mix(primary, '#000000', 0.14),
      '--primary-soft': softLight,
      '--primary-text': textLight,
      '--ring': `rgba(${r}, ${g}, ${b}, 0.35)`,
      '--navy': navy,
      '--navy-2': mix(navy, '#FFFFFF', 0.12),
      '--navy-line': mix(navy, '#FFFFFF', 0.08),
    },
    dark: {
      '--primary': primary,
      '--primary-hover': mix(primary, '#000000', 0.14),
      '--primary-soft': softDark,
      '--primary-text': textDark,
      '--ring': `rgba(${r}, ${g}, ${b}, 0.45)`,
      '--navy': mix(navy, '#000000', 0.35),
      '--navy-2': mix(navy, '#000000', 0.15),
      '--navy-line': mix(navy, '#FFFFFF', 0.06),
    },
  };
}

/** CSS that overrides the design tokens; `html` raises specificity above the defaults in globals.css. */
export function brandCss(primaryColor: string, sidebarColor: string) {
  const p = palette(primaryColor, sidebarColor);
  const body = (o: Record<string, string>) =>
    Object.entries(o)
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
  return `html:root{${body(p.light)}}html.dark{${body(p.dark)}}`;
}

/** Background of a person's initials: the chosen colour (kept dark enough for white text) or one per name. */
const AUTO = ['#C2410C', '#B91C1C', '#7C3AED', '#0F766E', '#1D4ED8', '#BE185D', '#4D7C0F', '#0E7490'];
export function avatarBackground(name: string, chosen: string) {
  if (isHex(chosen)) return until(chosen, 'black', (c) => contrast(c, '#FFFFFF') >= 4.6);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO[h % AUTO.length]!;
}
