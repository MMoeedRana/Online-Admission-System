import 'server-only';
import { DEFAULT_BRAND, type Brand } from './brand';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function serverBrand(): Promise<Brand> {
  try {
    const r = await fetch(`${API_URL}/api/v1/public/branding`, { next: { revalidate: 30 } });
    if (!r.ok) return DEFAULT_BRAND;
    return { ...DEFAULT_BRAND, ...((await r.json()) as { data: Brand }).data };
  } catch {
    return DEFAULT_BRAND;
  }
}
