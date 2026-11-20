'use client';

import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const shortDay = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${d}T00:00:00Z`),
  );

const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  color: 'var(--ink)',
  fontSize: 12.5,
};

export function DailyBars({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  const rows = data.map((d) => ({ ...d, day: shortDay(d.date) }));
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total)
    return <p className="text-muted flex h-full items-center justify-center text-[13px]">Nothing in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ left: -18, right: 8, top: 8 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={18}
          tick={{ fill: 'var(--muted)', fontSize: 11.5 }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--muted)', fontSize: 11.5 }}
        />
        <Tooltip
          cursor={{ fill: 'var(--card-soft)' }}
          contentStyle={tooltipStyle}
          labelStyle={{ color: 'var(--muted)' }}
          formatter={(v) => [formatNumber(Number(v)), label]}
        />
        <Bar dataKey="count" name={label} fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Funnel({ steps }: { steps: { key: string; label: string; value: number }[] }) {
  const top = steps[0]?.value || 1;
  return (
    <ol className="space-y-3.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.value : null;
        const share = Math.round((s.value / top) * 1000) / 10;
        const conv = prev ? Math.round((s.value / prev) * 1000) / 10 : null;
        return (
          <li
            key={s.key}
            className="grid grid-cols-[88px_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[104px_1fr_132px]"
          >
            <span className="text-ink text-[13px] font-semibold">{s.label}</span>
            <div className="bg-card-soft relative h-9 overflow-hidden rounded-lg" title={`${s.label}: ${s.value}`}>
              <motion.div
                className="bg-primary absolute inset-y-0 left-0 rounded-lg"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(share, s.value ? 2 : 0)}%` }}
                transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              />
              <span
                className={cn(
                  'absolute inset-y-0 left-3 flex items-center text-[13px] font-bold tabular-nums',
                  share > 18 ? 'text-white' : 'text-ink',
                  share <= 18 && 'right-3 left-auto',
                )}
              >
                {formatNumber(s.value)}
              </span>
            </div>
            <span className="text-muted col-start-2 text-[12px] leading-tight tabular-nums sm:col-start-auto sm:text-right">
              <span className="text-ink font-semibold">{share}%</span> of submitted
              {conv !== null && <span className="block">{conv}% of previous step</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Meter({
  label,
  value,
  detail,
  tone = 'blue',
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red';
}) {
  const color = {
    blue: 'bg-primary',
    green: 'bg-green-600 dark:bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-600 dark:bg-red-500',
  }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-[13px]">{label}</span>
        <span className="text-ink text-[14px] font-bold tabular-nums">{value}%</span>
      </div>
      <div
        className="bg-card-soft mt-1.5 h-2 overflow-hidden rounded-full"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value)}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {detail && <p className="text-muted mt-1 text-[12px]">{detail}</p>}
    </div>
  );
}
