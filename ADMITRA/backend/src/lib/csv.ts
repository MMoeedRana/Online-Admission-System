import type { Response } from 'express';

/** Quotes a value for CSV and neutralises spreadsheet formulas (CSV injection, SEC-5). */
export function csvCell(v: unknown): string {
  let s = v instanceof Date ? v.toISOString() : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** RPT-2: sends rows as a UTF-8 CSV file that opens correctly in Excel. */
export function sendCsv(res: Response, filename: string, header: string[], rows: unknown[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send('﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
}
