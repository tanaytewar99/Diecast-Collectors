import { valuate } from './api';
import { useStore } from './store';
import { isStale, toMarketValue } from './value';

const inFlight = new Set<string>();

export function isRefreshing(id: string) {
  return inFlight.has(id);
}

/** Re-value one car. Only `market` and `valueHistory` change; identification fields are never touched. */
export async function refreshCar(id: string): Promise<void> {
  const car = useStore.getState().cars.find((c) => c.id === id);
  if (!car || inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const valuation = await valuate(car, car.currency);
    useStore.getState().applyMarket(id, toMarketValue(valuation));
  } finally {
    inFlight.delete(id);
  }
}

let ranThisSession = false;

/** On app open: re-value up to `max` cars whose market value is older than 7 days, oldest first. */
export async function autoRefreshStale(max = 5): Promise<void> {
  const { cars, settings } = useStore.getState();
  if (ranThisSession || !settings.autoRefresh) return;
  ranThisSession = true;
  const stale = cars
    .filter((c) => c.status === 'owned' && isStale(c))
    .sort((a, b) => (a.market?.checkedAt ?? '').localeCompare(b.market?.checkedAt ?? ''))
    .slice(0, max);
  for (const car of stale) {
    try {
      await refreshCar(car.id);
    } catch {
      // Network or server hiccup: stop quietly, try again next launch.
      return;
    }
  }
}
