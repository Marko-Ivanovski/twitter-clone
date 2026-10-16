const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60],
  ['hour', 60 * 60],
  ['day', 60 * 60 * 24],
  ['week', 60 * 60 * 24 * 7],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

export const formatRelativeTime = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';

  for (let i = UNITS.length - 1; i >= 0; i -= 1) {
    const [unit, size] = UNITS[i];
    if (seconds >= size) {
      if (unit === 'week' && seconds >= size * 5) break;
      return formatter.format(-Math.floor(seconds / size), unit);
    }
  }

  return new Date(iso).toLocaleDateString();
};
