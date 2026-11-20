import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { brandCss } from '@/lib/brand';
import { serverBrand } from '@/lib/server-brand';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const b = await serverBrand();
  return {
    title: { default: `${b.platformName} - Online Admission System`, template: `%s | ${b.platformName}` },
    description: `${b.tagline} Find programs, apply online with verified marks and follow your admission in one place.`,
    icons: b.faviconUrl ? { icon: b.faviconUrl } : undefined,
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1226' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await serverBrand();
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <style id="platform-brand-ssr">{brandCss(brand.primaryColor, brand.sidebarColor)}</style>
      </head>
      <body className="min-h-dvh font-sans">
        <Providers brand={brand}>{children}</Providers>
      </body>
    </html>
  );
}
