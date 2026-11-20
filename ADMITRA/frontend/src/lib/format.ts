const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const numberFmt = new Intl.NumberFormat('en-PK');

export function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '-';
  return dateTimeFmt.format(new Date(value));
}

export function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `Rs. ${numberFmt.format(value)}`;
}

export function formatNumber(value?: number | null) {
  return numberFmt.format(value ?? 0);
}

export function daysLeft(value: string | Date) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function toLocalInput(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(value?: string | Date | null) {
  return toLocalInput(value).slice(0, 10);
}
