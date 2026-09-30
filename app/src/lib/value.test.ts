import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseAmount, relativeTime } from './format';
import type { Car } from './types';
import { appendValuePoint, collectionSeries, effectiveValue, gain, isStale, monthChange, totals } from './value';

function car(over: Partial<Car> = {}): Car {
  return {
    id: 'c1',
    status: 'owned',
    photoUri: null,
    photoPath: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    description: null,
    aiConfidence: 0.9,
    name: 'Test',
    make: null,
    model: null,
    brand: 'Hot Wheels',
    series: null,
    year: 2024,
    scale: '1:64',
    color: null,
    castingNumber: null,
    packaging: 'carded',
    condition: 'mint',
    flags: [],
    currency: 'USD',
    purchasePrice: null,
    myValue: null,
    market: null,
    valueHistory: [],
    myValueHistory: [],
    notes: null,
    ...over,
  };
}

const market = (estimate: number, checkedAt: string) => ({
  estimate,
  low: estimate - 1,
  high: estimate + 1,
  confidence: 'medium' as const,
  rationale: '',
  sources: [],
  checkedAt,
});

test('my value wins over market value', () => {
  assert.equal(effectiveValue(car({ market: market(10, '2026-06-01T00:00:00Z') })), 10);
  assert.equal(effectiveValue(car({ market: market(10, '2026-06-01T00:00:00Z'), myValue: 25 })), 25);
  assert.equal(effectiveValue(car()), 0);
});

test('gain compares against purchase price', () => {
  assert.equal(gain(car({ market: market(10, '2026-06-01T00:00:00Z') })), null);
  const g = gain(car({ purchasePrice: 5, market: market(10, '2026-06-01T00:00:00Z') }));
  assert.deepEqual(g, { amount: 5, pct: 1 });
  assert.equal(gain(car({ purchasePrice: 5 })), null);
});

test('totals ignore wishlist cars and only count gain on priced cars', () => {
  const t = totals([
    car({ id: 'a', purchasePrice: 2, myValue: 10 }),
    car({ id: 'b', market: market(4, '2026-06-01T00:00:00Z') }),
    car({ id: 'c', status: 'wishlist', myValue: 100 }),
  ]);
  assert.equal(t.owned, 2);
  assert.equal(t.wishlist, 1);
  assert.equal(t.collectionValue, 14);
  assert.equal(t.invested, 2);
  assert.equal(t.gain, 8);
});

test('appendValuePoint keeps one snapshot per day, sorted', () => {
  let h = appendValuePoint([], market(5, '2026-06-02T10:00:00Z'));
  h = appendValuePoint(h, market(6, '2026-06-01T10:00:00Z'));
  h = appendValuePoint(h, market(7, '2026-06-02T18:00:00Z'));
  assert.deepEqual(
    h.map((p) => p.estimate),
    [6, 7],
  );
});

test('staleness is 7 days by default', () => {
  const now = new Date('2026-06-10T00:00:00Z').getTime();
  assert.equal(isStale(car(), 7, now), true);
  assert.equal(isStale(car({ market: market(1, '2026-06-05T00:00:00Z') }), 7, now), false);
  assert.equal(isStale(car({ market: market(1, '2026-06-01T00:00:00Z') }), 7, now), true);
});

test('collection series and month change follow snapshots', () => {
  const c = car({
    createdAt: '2026-05-01T00:00:00Z',
    valueHistory: [
      { date: '2026-05-01T00:00:00Z', estimate: 10, low: 9, high: 11 },
      { date: '2026-06-15T00:00:00Z', estimate: 15, low: 14, high: 16 },
    ],
  });
  const today = new Date('2026-06-20T00:00:00Z');
  const s = collectionSeries([c], today);
  assert.deepEqual(
    s.map((p) => p.value),
    [10, 15, 15],
  );
  const m = monthChange([c], today);
  assert.equal(m?.amount, 5);
  assert.equal(m?.pct, 0.5);
});

test('parseAmount handles common inputs', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount('$1,200'), 1200);
  assert.equal(parseAmount('3,99'), 3.99);
  assert.equal(parseAmount('abc'), null);
});

test('formatting helpers', () => {
  assert.match(formatMoney(12.5, 'USD'), /12\.50/);
  assert.equal(formatMoney(null, 'USD'), '—');
  assert.equal(relativeTime('2026-06-10T00:00:00Z', new Date('2026-06-13T00:00:00Z').getTime()), '3 days ago');
});
