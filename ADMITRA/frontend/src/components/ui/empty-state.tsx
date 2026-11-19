import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="bg-primary-soft text-primary flex size-14 items-center justify-center rounded-2xl">
        <Icon className="size-7" />
      </span>
      <h3 className="mt-4 text-[15px] font-bold">{title}</h3>
      {text && <p className="text-muted mt-1 max-w-sm text-[13px]">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
