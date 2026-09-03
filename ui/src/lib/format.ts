// Human-readable rendering of the ISO-8601 instants the API returns.

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function formatInstant(iso: string | null | undefined, opts?: { dateOnly?: boolean }): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (opts?.dateOnly ? DATE_ONLY : DATE_TIME).format(d);
}
