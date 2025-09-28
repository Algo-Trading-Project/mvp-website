export function shiftDays(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function parseDate(date: unknown): string | null {
  if (typeof date !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return null;
}
