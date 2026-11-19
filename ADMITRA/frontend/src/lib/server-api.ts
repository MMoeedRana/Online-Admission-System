import 'server-only';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export class ServerApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fetch used by Server Components for public pages. Returns { data, meta }. */
export async function serverGet<T>(path: string, params?: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const url = `${API_URL}/api/v1${path}${qs.size ? `?${qs}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ServerApiError(503, 'The ADMITRA service is not reachable right now.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ServerApiError(res.status, body?.error?.message ?? 'Request failed');
  return body as { data: T; meta?: { page: number; limit: number; total: number; pages: number } };
}
