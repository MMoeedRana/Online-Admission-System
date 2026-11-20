export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\b(MR|MRS|MS|MISS|DR)\b/g, ' ')
    .replace(/\b(MOHAMMAD|MOHAMMED|MUHAMMED|MOHAMED|MUHAMAD|M)\b/g, 'MUHAMMAD')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length]!;
}

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x && !y) return 1;
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}
