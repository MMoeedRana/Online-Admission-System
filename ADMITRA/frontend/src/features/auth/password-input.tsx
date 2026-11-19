'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput(props, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={show ? 'text' : 'password'} className="pr-11" {...props} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="text-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5"
        >
          {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
    );
  },
);

export const passwordRules = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'An upper-case letter' },
  { test: (v: string) => /[a-z]/.test(v), label: 'A lower-case letter' },
  { test: (v: string) => /\d/.test(v), label: 'A digit' },
];

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
      {passwordRules.map((r) => (
        <li key={r.label} className={r.test(value) ? 'text-green-600 dark:text-green-400' : 'text-muted'}>
          {r.test(value) ? '✓' : '•'} {r.label}
        </li>
      ))}
    </ul>
  );
}
