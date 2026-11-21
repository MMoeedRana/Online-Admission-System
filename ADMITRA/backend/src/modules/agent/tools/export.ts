import { Types } from 'mongoose';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { brand } from '../../../lib/brand';
import { csvCell } from '../../../lib/csv';
import { fileStore } from '../../../lib/file-store';
import { reportPdfBuffer } from '../../../lib/pdf';
import { AgentExportModel } from '../agent.models';
import { defineTool, ToolError, type AgentContext, type AgentTool } from './common';
import { readTools } from './read';

const FORMATS = ['xlsx', 'pdf', 'csv'] as const;
type Format = (typeof FORMATS)[number];
const MIME: Record<Format, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
};

export function allowedRead(ctx: AgentContext, t: AgentTool) {
  if (t.kind !== 'read') return false;
  if (ctx.scope === 'PLATFORM') return t.scope !== 'institution';
  if (t.scope === 'platform') return false;
  return !t.permission || ctx.permissions.includes(t.permission);
}

const label = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

function cellValue(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v instanceof Types.ObjectId) return String(v);
  if (Array.isArray(v))
    return v.every((x) => typeof x !== 'object' || x === null) ? v.join(', ') : `${v.length} item(s)`;
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => typeof x !== 'object' || x === null)
      .map(([k, x]) => `${label(k)}: ${x ?? ''}`)
      .join('; ');
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
}

export function toTable(data: unknown): { columns: string[]; rows: (string | number)[][] } {
  let list: Record<string, unknown>[] | null = null;
  if (Array.isArray(data)) list = data as Record<string, unknown>[];
  else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const key = Object.keys(obj).find(
      (k) =>
        Array.isArray(obj[k]) && (obj[k] as unknown[]).length && typeof (obj[k] as unknown[])[0] === 'object',
    );
    if (key) list = obj[key] as Record<string, unknown>[];
    else
      return {
        columns: ['Item', 'Value'],
        rows: Object.entries(obj).map(([k, v]) => [label(k), cellValue(v)]),
      };
  }
  if (!list?.length) return { columns: ['Result'], rows: [] };
  const keys: string[] = [];
  for (const r of list.slice(0, 50))
    for (const k of Object.keys(r ?? {})) if (!keys.includes(k)) keys.push(k);
  const cols = keys.slice(0, 14);
  return { columns: cols.map(label), rows: list.map((r) => cols.map((k) => cellValue(r?.[k]))) };
}

async function build(format: Format, title: string, subtitle: string, t: ReturnType<typeof toTable>) {
  if (format === 'csv') {
    const lines = [t.columns, ...t.rows].map((r) => r.map(csvCell).join(','));
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }
  if (format === 'pdf')
    return reportPdfBuffer({
      title,
      subtitle,
      filename: 'export.pdf',
      columns: t.columns.map((c) => ({ label: c, width: 1 })),
      rows: t.rows,
      landscape: t.columns.length > 5,
    });
  const wb = new ExcelJS.Workbook();
  wb.creator = brand().platformName;
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.addRow(t.columns);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F8' } };
  for (const r of t.rows) ws.addRow(r);
  t.columns.forEach((c, i) => {
    const longest = Math.max(c.length, ...t.rows.slice(0, 200).map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const exportTools = [
  defineTool({
    name: 'export_list',
    label: 'Preparing the file',
    description:
      'Create a downloadable Excel (xlsx), PDF or CSV file from the live result of one read tool, for example when the user asks to export, download or "make a list" of applications, payments, institutions or alerts. Give the read tool in "source" and its arguments in "args". The file contains exactly the data that tool returns; a download button is shown to the user.',
    scope: 'both',
    kind: 'read',
    input: z.object({
      source: z
        .enum(readTools.map((t) => t.name) as [string, ...string[]])
        .describe('The read tool whose result becomes the file'),
      args: z.object({}).catchall(z.unknown()).optional().describe('Arguments for the source tool'),
      format: z.enum(FORMATS).default('xlsx').describe('xlsx (Excel), pdf or csv'),
      title: z.string().max(80).optional().describe('Title of the file'),
    }),
    run: async (
      ctx,
      input: { source: string; args?: Record<string, unknown>; format: Format; title?: string },
    ) => {
      const tool = readTools.find((t) => t.name === input.source);
      if (!tool || !allowedRead(ctx, tool)) throw new ToolError(`You cannot export from ${input.source}.`);
      const parsed = tool.input.safeParse(input.args ?? {});
      if (!parsed.success)
        throw new ToolError(
          `Invalid arguments for ${input.source}: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        );
      const table = toTable(await tool.run(ctx, parsed.data));
      const title =
        input.title?.trim() ||
        label(tool.label.replace(/…$/, '').replace(/^(Reading|Checking|Looking up|Reviewing)\s+/i, ''));
      const when = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
      const subtitle = `${brand().platformName} · ${ctx.scope === 'PLATFORM' ? 'All institutions' : ctx.institutionName} · ${table.rows.length} row(s) · ${when}`;
      const body = await build(input.format, title, subtitle, table);
      const _id = new Types.ObjectId();
      const safe =
        title
          .replace(/[^\w\- ]+/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 60) || 'export';
      const name = `${safe}-${when}.${input.format}`;
      const storageKey = `exports/${_id}.${input.format}`;
      await fileStore().put(storageKey, body, MIME[input.format]);
      await AgentExportModel.create({
        _id,
        userId: ctx.userId,
        scope: ctx.scope,
        institutionId: ctx.institutionId,
        name,
        format: input.format,
        mimeType: MIME[input.format],
        storageKey,
        rows: table.rows.length,
        size: body.length,
        source: tool.name,
      });
      return {
        status: 'file_ready',
        file: { _id: String(_id), name, format: input.format, rows: table.rows.length },
        note: 'A download button for this file is shown to the user. Tell the user the file is ready.',
      };
    },
  }),
];
