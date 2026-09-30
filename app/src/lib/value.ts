import type { Car, MarketValue, Valuation, ValuePoint } from './types';

/** The headline value of a car: the collector's own valuation wins over the market estimate. */
export function effectiveValue(car: Car): number {
  return car.myValue ?? car.market?.estimate ?? 0;
}

/** Gain vs. purchase price, or null when there's nothing to compare. */
export function gain(car: Car): { amount: number; pct: number | null } | null {
  if (car.purchasePrice === null) return null;
  const value = car.myValue ?? car.market?.estimate;
  if (value === undefined || value === null) return null;
  const amount = value - car.purchasePrice;
  return { amount, pct: car.purchasePrice > 0 ? amount / car.purchasePrice : null };
}

export function toMarketValue(v: Valuation, checkedAt = new Date().toISOString()): MarketValue {
  return {
    estimate: v.estimate,
    low: v.low,
    high: v.high,
    confidence: v.confidence,
    rationale: v.rationale,
    sources: v.sources,
    checkedAt,
  };
}

/** Append a snapshot, replacing any existing one from the same day. */
export function appendValuePoint(history: ValuePoint[], m: MarketValue): ValuePoint[] {
  const day = m.checkedAt.slice(0, 10);
  const point = { date: m.checkedAt, estimate: m.estimate, low: m.low, high: m.high };
  return [...history.filter((p) => p.date.slice(0, 10) !== day), point].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function appendMyValue(history: Car['myValueHistory'], value: number | null, date = new Date().toISOString()) {
  if (value === null) return history;
  const day = date.slice(0, 10);
  return [...history.filter((p) => p.date.slice(0, 10) !== day), { date, value }];
}

export function isStale(car: Car, maxAgeDays = 7, now = Date.now()): boolean {
  if (!car.market) return true;
  return now - new Date(car.market.checkedAt).getTime() > maxAgeDays * 86_400_000;
}

export interface Totals {
  owned: number;
  wishlist: number;
  invested: number;
  marketValue: number;
  myValue: number;
  collectionValue: number;
  gain: number;
}

export function totals(cars: Car[]): Totals {
  const owned = cars.filter((c) => c.status === 'owned');
  const sum = (f: (c: Car) => number) => owned.reduce((acc, c) => acc + f(c), 0);
  const invested = sum((c) => c.purchasePrice ?? 0);
  const collectionValue = sum(effectiveValue);
  const pricedValue = sum((c) => (c.purchasePrice !== null ? effectiveValue(c) : 0));
  return {
    owned: owned.length,
    wishlist: cars.length - owned.length,
    invested,
    marketValue: sum((c) => c.market?.estimate ?? 0),
    myValue: sum((c) => c.myValue ?? 0),
    collectionValue,
    gain: pricedValue - invested,
  };
}

/** Value of a car as of a date, using the latest snapshot at or before it. */
function valueAt(car: Car, date: string): number | null {
  const created = car.createdAt.slice(0, 10);
  if (date < created) return null;
  const mine = [...car.myValueHistory].reverse().find((p) => p.date.slice(0, 10) <= date);
  if (mine) return mine.value;
  const market = [...car.valueHistory].reverse().find((p) => p.date.slice(0, 10) <= date);
  if (market) return market.estimate;
  // Before the first snapshot, fall back to the earliest known value so the line doesn't jump.
  return car.myValueHistory[0]?.value ?? car.valueHistory[0]?.estimate ?? null;
}

/** Daily collection value series for owned cars, from the first add until today. */
export function collectionSeries(cars: Car[], today = new Date()): { date: string; value: number }[] {
  const owned = cars.filter((c) => c.status === 'owned');
  const dates = new Set<string>();
  for (const c of owned) {
    dates.add(c.createdAt.slice(0, 10));
    c.valueHistory.forEach((p) => dates.add(p.date.slice(0, 10)));
    c.myValueHistory.forEach((p) => dates.add(p.date.slice(0, 10)));
  }
  dates.add(today.toISOString().slice(0, 10));
  return [...dates].sort().map((date) => ({
    date,
    value: owned.reduce((acc, c) => acc + (valueAt(c, date) ?? 0), 0),
  }));
}

/** Change in collection value vs. ~30 days ago. */
export function monthChange(cars: Car[], today = new Date()): { amount: number; pct: number | null } | null {
  const series = collectionSeries(cars, today);
  if (series.length < 2) return null;
  const cutoff = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const base = [...series].reverse().find((p) => p.date <= cutoff) ?? series[0];
  const current = series[series.length - 1].value;
  const amount = current - base.value;
  return { amount, pct: base.value > 0 ? amount / base.value : null };
}
