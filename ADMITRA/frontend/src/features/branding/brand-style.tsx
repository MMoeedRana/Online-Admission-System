'use client';

import { brandCss } from '@/lib/brand';
import { useBrand } from './brand-context';

export function PlatformBrandStyle() {
  const b = useBrand();
  return <style id="platform-brand">{brandCss(b.primaryColor, b.sidebarColor)}</style>;
}

export function InstitutionBrandStyle({ primaryColor, sidebarColor }: { primaryColor: string; sidebarColor: string }) {
  const b = useBrand();
  if (!primaryColor && !sidebarColor) return null;
  return (
    <style id="institution-brand">{brandCss(primaryColor || b.primaryColor, sidebarColor || b.sidebarColor)}</style>
  );
}
