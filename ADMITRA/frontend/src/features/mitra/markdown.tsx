import { Fragment, type ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g)
    .filter(Boolean)
    .map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**'))
        return (
          <strong key={`${key}-${i}`} className="text-ink font-semibold">
            {p.slice(2, -2)}
          </strong>
        );
      if (p.startsWith('`') && p.endsWith('`'))
        return (
          <code key={`${key}-${i}`} className="bg-card-soft rounded px-1 py-0.5 font-mono text-[12.5px]">
            {p.slice(1, -1)}
          </code>
        );
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={`${key}-${i}`}>{p.slice(1, -1)}</em>;
      return <Fragment key={`${key}-${i}`}>{p}</Fragment>;
    });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const cells = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      out.push(
        <div
          key={`t${i}`}
          className="border-line my-2 overflow-x-auto rounded-xl border"
          tabIndex={0}
          role="region"
          aria-label="Table"
        >
          <table className="w-full text-left text-[13px]">
            <thead className="bg-card-soft">
              <tr>
                {head.map((h, k) => (
                  <th key={k} className="text-muted px-3 py-2 text-[11.5px] font-semibold uppercase">
                    {inline(h, `h${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className="border-line border-t">
                  {r.map((c, m) => (
                    <td key={m} className="text-body px-3 py-2">
                      {inline(c, `c${k}${m}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      out.push(
        <p key={`h${i}`} className="text-ink mt-2 text-[14px] font-bold">
          {inline(h[2]!, `h${i}`)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!))
        items.push(lines[i++]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={`l${i}`} className={`my-1 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, k) => (
            <li key={k}>{inline(it, `l${i}${k}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    out.push(
      <p key={`p${i}`} className="my-1">
        {inline(line, `p${i}`)}
      </p>,
    );
    i++;
  }
  return <div className="text-[14px] leading-relaxed">{out}</div>;
}
