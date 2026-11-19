import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => w && !/^(dr|prof|mr|ms|mrs)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
