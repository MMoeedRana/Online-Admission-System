import { cn } from '@/lib/utils';

export function ProgressRing({
  value,
  size = 56,
  tone = 'blue',
  className,
}: {
  value: number;
  size?: number;
  tone?: 'blue' | 'amber' | 'red' | 'green' | 'gray';
  className?: string;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const colors = { blue: 'var(--primary)', amber: '#D97706', red: '#DC2626', green: '#16A34A', gray: '#94A3B8' };
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, value)) / 100}
        />
      </svg>
      <span className="text-ink absolute inset-0 flex items-center justify-center text-[13px] font-bold">{value}%</span>
    </div>
  );
}

export function toneForStatus(status: string): 'blue' | 'amber' | 'red' | 'green' | 'gray' {
  if (['VERIFIED'].includes(status)) return 'green';
  if (['PAYMENT_PENDING', 'DRAFT'].includes(status)) return 'amber';
  if (['DEFICIENT', 'REJECTED'].includes(status)) return 'red';
  if (['WITHDRAWN'].includes(status)) return 'gray';
  return 'blue';
}
