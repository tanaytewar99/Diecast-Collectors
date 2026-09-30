import type { CarDetails, IdentifyResponse, Valuation } from './types';
import { useStore } from './store';

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { apiUrl, appKey } = useStore.getState().settings;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(appKey ? { 'x-app-key': appKey } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'The request took too long. Please try again.'
        : "Can't reach the Diecast Collectors server. Check your connection or the server URL in Settings.",
    );
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? `Server error (${res.status})`);
  return json as T;
}

export function identify(image: string, mediaType: string, hint?: string): Promise<IdentifyResponse> {
  const { currency } = useStore.getState().settings;
  return post('/api/identify', { image, mediaType, currency, hint }, 180_000);
}

export async function valuate(car: CarDetails, currency: string): Promise<Valuation> {
  const { valuation } = await post<{ valuation: Valuation }>('/api/valuate', { car: pickDetails(car), currency }, 150_000);
  return valuation;
}

/** Strip a Car down to the fields the server accepts. */
export function pickDetails(c: CarDetails): CarDetails {
  return {
    name: c.name,
    make: c.make,
    model: c.model,
    brand: c.brand,
    series: c.series,
    year: c.year,
    scale: c.scale,
    color: c.color,
    castingNumber: c.castingNumber,
    packaging: c.packaging,
    condition: c.condition,
    flags: c.flags,
  };
}
