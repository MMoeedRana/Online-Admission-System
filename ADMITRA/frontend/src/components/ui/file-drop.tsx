'use client';

import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function FileDrop({
  accept,
  hint,
  file,
  onFile,
  compact,
}: {
  accept: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files[0] ?? null);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition',
        compact ? 'px-4 py-4' : 'px-6 py-8',
        over ? 'border-primary bg-primary-soft' : 'border-line bg-card-soft hover:border-primary/50',
      )}
    >
      <FileUp className="text-muted size-6" />
      <p className="text-ink mt-2 text-[13.5px] font-semibold">{file ? file.name : 'Drop your file here or browse'}</p>
      <p className="text-muted mt-0.5 text-[12px]">{file ? `${(file.size / 1024).toFixed(0)} KB` : hint}</p>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
