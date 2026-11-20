import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Stepper({
  steps,
  current,
  onStep,
}: {
  steps: string[];
  current: number;
  onStep?: (i: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((s, i) => (
        <li key={s} className={cn('flex items-center gap-2 sm:gap-3', i < steps.length - 1 && 'flex-1')}>
          <button
            type="button"
            disabled={!onStep}
            onClick={() => onStep?.(i)}
            className={cn(
              'flex items-center gap-2 text-[13.5px] font-semibold',
              i === current ? 'text-ink' : i < current ? 'text-primary' : 'text-muted',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                i === current
                  ? 'bg-primary text-white'
                  : i < current
                    ? 'bg-primary-soft text-primary'
                    : 'bg-card-soft text-muted',
              )}
            >
              {i < current ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s}</span>
          </button>
          {i < steps.length - 1 && <span className="bg-line h-px flex-1" />}
        </li>
      ))}
    </ol>
  );
}
