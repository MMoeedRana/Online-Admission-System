'use client';

import { ExternalLink, FileText } from 'lucide-react';
import { openFile, useBlobUrl } from '@/lib/files';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

/** Inline preview of an uploaded image or PDF. */
export function FilePreview({ fileId, className }: { fileId: string | null | undefined; className?: string }) {
  const url = fileId ? `/files/${fileId}` : null;
  const blob = useBlobUrl(url);
  if (!fileId) {
    return (
      <div className={cn('bg-card-soft text-muted flex flex-col items-center justify-center rounded-xl', className)}>
        <FileText className="size-8" />
        <p className="mt-2 text-[12.5px]">No file uploaded</p>
      </div>
    );
  }
  return (
    <div className={cn('border-line bg-card-soft relative overflow-hidden rounded-xl border', className)}>
      {!blob ? (
        <div className="text-primary flex h-full items-center justify-center">
          <Spinner className="size-6" />
        </div>
      ) : blob.type.startsWith('image/') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={blob.src} alt="Uploaded document" className="h-full w-full object-contain" />
      ) : blob.type === 'application/pdf' ? (
        <iframe src={blob.src} title="Uploaded document" className="h-full w-full" />
      ) : (
        <p className="text-muted p-4 text-[13px]">Preview not available.</p>
      )}
      <button
        type="button"
        onClick={() => void openFile(url!)}
        className="bg-card/90 text-ink absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold shadow"
      >
        <ExternalLink className="size-3.5" /> Open
      </button>
    </div>
  );
}
