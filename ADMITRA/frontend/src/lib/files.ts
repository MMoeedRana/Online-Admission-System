'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import { toast } from '@/components/ui/toast';

/** Private files and PDFs need the access token, so they are fetched as blobs (DOC-3). */
export async function fetchBlob(url: string) {
  const r = await api.get<Blob>(url, { responseType: 'blob' });
  return r.data;
}

export async function openFile(url: string) {
  const win = window.open('', '_blank');
  try {
    const blob = await fetchBlob(url);
    const href = URL.createObjectURL(blob);
    if (win) win.location.href = href;
    else window.location.href = href;
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch (err) {
    win?.close();
    toast.error(errorMessage(err, 'The file could not be opened.'));
  }
}

export async function downloadFile(url: string, filename: string) {
  try {
    const blob = await fetchBlob(url);
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch (err) {
    toast.error(errorMessage(err, 'The file could not be downloaded.'));
  }
}

export function useBlobUrl(url: string | null) {
  const [state, setState] = useState<{ src: string; type: string; url: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let href = '';
    let alive = true;
    fetchBlob(url)
      .then((b) => {
        href = URL.createObjectURL(b);
        if (alive) setState({ src: href, type: b.type, url });
      })
      .catch(() => alive && setState({ src: '', type: '', url }));
    return () => {
      alive = false;
      if (href) URL.revokeObjectURL(href);
    };
  }, [url]);
  return state && state.url === url ? state : null;
}
