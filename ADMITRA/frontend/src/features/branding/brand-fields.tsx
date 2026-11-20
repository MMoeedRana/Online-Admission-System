'use client';

import { CheckCircle2, ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { contrast, isHex, palette } from '@/lib/brand';
import { cn } from '@/lib/utils';

const PRESETS = ['#1A62D6', '#0F766E', '#15803D', '#7C3AED', '#BE185D', '#B91C1C', '#C2410C', '#0E7490', '#334155'];
const SIDEBAR_PRESETS = ['#0B1B3A', '#0F2A2A', '#14211A', '#1E1B3A', '#2A1020', '#1F2937', '#0C1B33', '#111827'];

export function ColorField({
  id,
  label,
  value,
  onChange,
  kind = 'primary',
  allowEmpty,
  emptyLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  kind?: 'primary' | 'sidebar' | 'avatar';
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const presets = kind === 'sidebar' ? SIDEBAR_PRESETS : PRESETS;
  const used = isHex(value)
    ? kind === 'sidebar'
      ? palette('#1A62D6', value).light['--navy']
      : palette(value, '#0B1B3A').light['--primary']
    : '';
  const adjusted = used && used.toUpperCase() !== value.toUpperCase();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-ink text-[13px] font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={isHex(value) ? value : '#1A62D6'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="border-line size-11 shrink-0 cursor-pointer rounded-xl border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          placeholder={allowEmpty ? (emptyLabel ?? 'Automatic') : '#1A62D6'}
          maxLength={7}
          onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
          className={value ? 'font-mono uppercase' : ''}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${label} presets`}>
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Use ${c}`}
            onClick={() => onChange(c)}
            className={cn(
              'size-7 rounded-full ring-2 ring-offset-2 ring-offset-[var(--card)] transition hover:scale-110',
              value.toUpperCase() === c ? 'ring-[var(--ink)]' : 'ring-transparent',
            )}
            style={{ background: c }}
          />
        ))}
        {allowEmpty && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-primary ml-1 text-[12.5px] font-semibold hover:underline"
          >
            Use {(emptyLabel ?? 'automatic').toLowerCase()}
          </button>
        )}
      </div>
      {adjusted && (
        <p className="text-muted flex items-center gap-1.5 text-[12px]">
          <span className="size-3.5 rounded-full" style={{ background: used }} />
          Adjusted to {used} so that text stays readable (contrast {contrast(used, '#FFFFFF').toFixed(1)}:1).
        </p>
      )}
      {value && !isHex(value) && (
        <p className="text-[12px] text-red-700 dark:text-red-400">Use six hex digits, e.g. #1A62D6.</p>
      )}
    </div>
  );
}

export function ImageField({
  label,
  hint,
  url,
  uploadUrl,
  accept = 'image/png,image/jpeg,image/webp',
  rounded = 'rounded-2xl',
  onDone,
  disabled,
}: {
  label: string;
  hint: string;
  url: string;
  uploadUrl: string;
  accept?: string;
  rounded?: string;
  onDone: (data: unknown) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const send = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<{ data: unknown }>(uploadUrl, fd);
      onDone(r.data.data);
      toast.success(`${label} updated.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const r = await api.delete<{ data: unknown }>(uploadUrl);
      onDone(r.data.data);
      toast.success(`${label} removed.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-4">
      <span
        className={cn(
          'border-line bg-card-soft flex size-20 shrink-0 items-center justify-center overflow-hidden border',
          rounded,
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${label} preview`} className="size-full object-contain" />
        ) : (
          <ImageUp className="text-muted size-7" aria-hidden />
        )}
      </span>
      <div className="min-w-0 space-y-2">
        <p className="text-ink text-[13.5px] font-semibold">{label}</p>
        <p className="text-muted text-[12px]">{hint}</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={ref}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => void send(e.target.files?.[0] ?? null)}
            aria-label={`Choose ${label.toLowerCase()}`}
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<ImageUp className="size-4" />}
            loading={busy}
            disabled={disabled}
            onClick={() => ref.current?.click()}
          >
            {url ? 'Replace' : 'Upload'}
          </Button>
          {url && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              disabled={busy || disabled}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function BrandPreview({
  primaryColor,
  sidebarColor,
  name,
  logoUrl,
  avatarColor,
}: {
  primaryColor: string;
  sidebarColor: string;
  name: string;
  logoUrl?: string;
  avatarColor?: string;
}) {
  const p = palette(primaryColor, sidebarColor).light;
  return (
    <div
      style={p as React.CSSProperties}
      className="border-line overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]"
      aria-label="Preview"
    >
      <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[150px_1fr]">
        <div className="space-y-2 p-3" style={{ background: p['--navy'] }}>
          <div className="flex items-center gap-2 pb-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-7 rounded-lg object-contain" />
            ) : (
              <span
                className="flex size-7 items-center justify-center rounded-lg text-[12px] font-extrabold text-white"
                style={{ background: p['--primary'] }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[12.5px] font-extrabold text-white">{name}</span>
          </div>
          <div
            className="rounded-lg px-2 py-1.5 text-[11.5px] font-semibold text-white"
            style={{ background: p['--primary'] }}
          >
            Dashboard
          </div>
          {['Applications', 'Payments', 'Merit Lists'].map((x) => (
            <div key={x} className="px-2 py-1 text-[11.5px] text-slate-300">
              {x}
            </div>
          ))}
        </div>
        <div className="bg-page space-y-3 p-4">
          <div className="bg-card border-line rounded-xl border p-3">
            <p className="text-ink text-[13px] font-bold">Applications</p>
            <p className="text-[12px] font-semibold" style={{ color: p['--primary-text'] }}>
              View all
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                style={{ background: p['--primary'] }}
              >
                Primary button
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                style={{ background: p['--primary-soft'], color: p['--primary-text'] }}
              >
                Badge
              </span>
              <span
                className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{
                  background:
                    avatarColor && isHex(avatarColor)
                      ? palette(avatarColor, sidebarColor).light['--primary']
                      : '#C2410C',
                }}
              >
                AN
              </span>
            </div>
          </div>
          <p className="text-muted flex items-center gap-1.5 text-[11.5px]">
            <CheckCircle2 className="size-3.5 text-green-700 dark:text-green-400" /> Text contrast checked (WCAG 2.2 AA)
          </p>
        </div>
      </div>
    </div>
  );
}
