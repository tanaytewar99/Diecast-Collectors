export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'] as const;

export function formatMoney(value: number | null | undefined, currency: string, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const noCents = currency === 'JPY' || Math.abs(value) >= 1000 || opts.compact;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: noCents ? 0 : 2,
      minimumFractionDigits: noCents ? 0 : Number.isInteger(value) ? 0 : 2,
      notation: opts.compact && Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(noCents ? 0 : 2)}`;
  }
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Parse a user-typed amount like "12.50" or "1,200". Returns null for empty/invalid. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export const PACKAGING_LABEL = { carded: 'Carded', boxed: 'Boxed', loose: 'Loose', unknown: 'Unknown' } as const;
export const CONDITION_LABEL = {
  mint: 'Mint',
  near_mint: 'Near mint',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: 'Unknown',
} as const;
