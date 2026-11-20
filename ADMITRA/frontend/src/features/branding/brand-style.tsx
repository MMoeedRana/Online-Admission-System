'use client';

import { brandCss } from '@/lib/brand';
import { useBrand } from './brand-context';

/** Applies the platform colours in the browser after a change (the server renders the first version). */
export function PlatformBrandStyle() {
  const b = useBrand();
  return <style id="platform-brand">{brandCss(b.primaryColor, b.sidebarColor)}</style>;
}

/** BRAND-2: the institution's own colours inside its workspace (only when its plan includes branding). */
export function InstitutionBrandStyle({ primaryColor, sidebarColor }: { primaryColor: string; sidebarColor: string }) {
  const b = useBrand();
  if (!primaryColor && !sidebarColor) return null;
  return (
    <style id="institution-brand">{brandCss(primaryColor || b.primaryColor, sidebarColor || b.sidebarColor)}</style>
  );
}
