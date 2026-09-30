import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { useStore } from './store';
import { supabase } from './supabase';
import type { CarDetails, IdentifyResponse, Valuation } from './types';

export class ApiError extends Error {}

/** Call a Supabase Edge Function as the signed-in user. */
async function call<T>(name: string, body: Record<string, unknown>, timeout: number): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body, timeout });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = await (error.context as Response).json().catch(() => null);
    throw new ApiError(payload?.error ?? 'Something went wrong. Please try again.');
  }
  if (error instanceof FunctionsFetchError) {
    throw new ApiError("Can't reach Diecast Collectors. Check your internet connection.");
  }
  throw new ApiError('Something went wrong. Please try again.');
}

/** Photo -> identification (AI) + market value (eBay). */
export function identify(image: string, mediaType: string, hint?: string): Promise<IdentifyResponse> {
  const { currency } = useStore.getState().settings;
  return call('identify', { image, mediaType, currency, hint }, 90_000);
}

/** Market value from current eBay listings. Free: no AI involved. */
export async function valuate(car: CarDetails, currency: string): Promise<Valuation> {
  const { valuation } = await call<{ valuation: Valuation }>('valuate', { car: pickDetails(car), currency }, 45_000);
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

export async function deleteAccount(): Promise<void> {
  await call('delete-account', {}, 60_000);
}
