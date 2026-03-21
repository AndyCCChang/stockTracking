function escapeCsvValue(value: string | number | null | undefined) {
  const normalized = value == null ? '' : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function toCsv(headers: string[], rows: Array<Record<string, string | number | null | undefined>>) {
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(','));
  }

  return lines.join('\n');
}
