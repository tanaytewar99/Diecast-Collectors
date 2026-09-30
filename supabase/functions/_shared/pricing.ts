/**
 * Free market valuation from eBay's Browse API (current fixed-price listings).
 * No AI involved, so value refreshes cost nothing.
 */
import { HttpError } from './http.ts';
import type { CarDetails, Valuation } from './schemas.ts';

type Fetch = typeof fetch;

export interface Listing {
  title: string;
  price: number;
  currency: string;
  url: string;
}

// Marketplace to search per display currency. Others search eBay US and convert.
const MARKETPLACE: Record<string, string> = {
  USD: 'EBAY_US',
  GBP: 'EBAY_GB',
  EUR: 'EBAY_DE',
  AUD: 'EBAY_AU',
  CAD: 'EBAY_CA',
};
// eBay US category "Diecast & Toy Vehicles". Category trees differ per marketplace, so only used on US.
const US_DIECAST_CATEGORY = '222';

export function marketplaceFor(currency: string): string {
  return MARKETPLACE[currency] ?? 'EBAY_US';
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'with', 'edition', 'car', 'diecast']);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Significant words of the car's name, e.g. "'71 Datsun 510" -> ["71", "datsun", "510"]. */
export function nameTokens(name: string): string[] {
  return [...new Set(normalize(name).split(' ').filter((t) => t && !STOPWORDS.has(t)))];
}

const hasFlag = (car: CarDetails, re: RegExp) => car.flags.some((f) => re.test(f));

function flagKeyword(car: CarDetails): string | null {
  if (hasFlag(car, /super\s*treasure/i)) return 'super treasure hunt';
  if (hasFlag(car, /treasure/i)) return 'treasure hunt';
  if (hasFlag(car, /chase/i)) return 'chase';
  return null;
}

/** Search queries from most to least specific. */
export function buildQueries(car: CarDetails): string[] {
  const name = nameTokens(car.name).join(' ');
  const brand = car.brand ?? '';
  const flag = flagKeyword(car) ?? '';
  const qs = [
    [brand, name, flag, car.year ?? ''].join(' '),
    [brand, name, flag].join(' '),
    [name, flag, 'diecast'].join(' '),
  ].map((q) => q.replace(/\s+/g, ' ').trim());
  return [...new Set(qs)];
}

// Listings that would distort a single-car price.
const JUNK =
  /\b(lot|lots|bundle|set of|\d+\s*(cars|pcs|pieces)|\d+\s*-?\s*pack|custom|wheels only|empty|protector|case|display|sticker|decal|poster|keychain|parts|repaint|you pick|u pick|pick your|choose)\b/;

export function isRelevant(title: string, car: CarDetails): boolean {
  const t = normalize(title);
  const words = new Set(t.split(' '));
  if (JUNK.test(t)) return false;

  const tokens = nameTokens(car.name);
  const hits = tokens.filter((tok) => words.has(tok)).length;
  if (tokens.length && hits < Math.ceil(tokens.length * 0.6)) return false;

  if (car.brand) {
    const brand = normalize(car.brand).replace(/ /g, '');
    const compact = t.replace(/ /g, '');
    const hotWheels = brand === 'hotwheels' && words.has('hw');
    if (!compact.includes(brand) && !hotWheels) return false;
  }

  // Treasure Hunts sell for many times a regular release; only compare like with like.
  const isSth = /super\s*treasure|\bsth\b/.test(t);
  const isTh = !isSth && /treasure\s*hunt|\bth\b/.test(t);
  if (isSth !== hasFlag(car, /super\s*treasure/i)) return false;
  if (isTh && !hasFlag(car, /treasure/i)) return false;
  if (/\bchase\b/.test(t) && !hasFlag(car, /chase/i)) return false;
  return true;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Median and interquartile range of relevant listings, with outliers removed. */
export function summarize(listings: Listing[], currency: string): Valuation {
  let prices = listings.map((l) => l.price).sort((a, b) => a - b);
  if (prices.length >= 4) {
    const q1 = quantile(prices, 0.25);
    const q3 = quantile(prices, 0.75);
    const iqr = q3 - q1;
    prices = prices.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  }
  const estimate = round2(quantile(prices, 0.5));
  const low = round2(quantile(prices, prices.length >= 4 ? 0.25 : 0));
  const high = round2(quantile(prices, prices.length >= 4 ? 0.75 : 1));
  const n = prices.length;
  const confidence: Valuation['confidence'] = n >= 10 && high <= low * 2 ? 'high' : n >= 4 ? 'medium' : 'low';

  const sources = [...listings]
    .sort((a, b) => Math.abs(a.price - estimate) - Math.abs(b.price - estimate))
    .slice(0, 5)
    .map((l) => ({ title: l.title, url: l.url }));

  return {
    estimate,
    low,
    high,
    confidence,
    rationale: `Median of ${n} current eBay listing${n === 1 ? '' : 's'} for this car (buy-it-now prices, shipping not included).`,
    sources,
    currency,
    listingsCount: n,
  };
}

// ---------------------------------------------------------------------------
// eBay + currency conversion (network)

let token: { value: string; expiresAt: number } | null = null;

async function ebayToken(fetchFn: Fetch, clientId: string, clientSecret: string, base: string): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetchFn(`${base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) {
    console.error('eBay token error', res.status, await res.text());
    throw new HttpError('Price lookup is not configured correctly.', 502);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

interface EbaySearchResponse {
  itemSummaries?: {
    title: string;
    price?: { value: string; currency: string };
    itemWebUrl: string;
  }[];
}

async function searchEbay(fetchFn: Fetch, base: string, accessToken: string, q: string, marketplace: string): Promise<Listing[]> {
  const params = new URLSearchParams({ q, limit: '50', filter: 'buyingOptions:{FIXED_PRICE}' });
  if (marketplace === 'EBAY_US') params.set('category_ids', US_DIECAST_CATEGORY);
  const res = await fetchFn(`${base}/buy/browse/v1/item_summary/search?${params}`, {
    headers: { authorization: `Bearer ${accessToken}`, 'x-ebay-c-marketplace-id': marketplace },
  });
  if (!res.ok) {
    console.error('eBay search error', res.status, await res.text());
    throw new HttpError('Price lookup failed. Please try again later.', 502);
  }
  const body = (await res.json()) as EbaySearchResponse;
  return (body.itemSummaries ?? [])
    .filter((i) => i.price && Number.parseFloat(i.price.value) > 0)
    .map((i) => ({ title: i.title, price: Number.parseFloat(i.price!.value), currency: i.price!.currency, url: i.itemWebUrl }));
}

const rates = new Map<string, { rate: number; at: number }>();

/** Exchange rate from the free Frankfurter API (European Central Bank data), cached for 12h. */
export async function fxRate(fetchFn: Fetch, from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const key = `${from}->${to}`;
  const cached = rates.get(key);
  if (cached && Date.now() - cached.at < 12 * 3_600_000) return cached.rate;
  const res = await fetchFn(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  if (!res.ok) throw new HttpError('Currency conversion is unavailable right now.', 502);
  const body = (await res.json()) as { rates: Record<string, number> };
  const rate = body.rates[to];
  if (!rate) throw new HttpError('Currency conversion is unavailable right now.', 502);
  rates.set(key, { rate, at: Date.now() });
  return rate;
}

export interface PricingDeps {
  fetch: Fetch;
  clientId: string;
  clientSecret: string;
  apiBase?: string;
}

export function pricingDepsFromEnv(): PricingDeps | null {
  const clientId = Deno.env.get('EBAY_CLIENT_ID');
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return { fetch, clientId, clientSecret, apiBase: Deno.env.get('EBAY_API_BASE') ?? 'https://api.ebay.com' };
}

export async function valuateFromEbay(car: CarDetails, currency: string, deps: PricingDeps | null): Promise<Valuation> {
  if (!deps) throw new HttpError('Price lookup is not set up yet (missing eBay keys).', 503);
  const base = deps.apiBase ?? 'https://api.ebay.com';
  const marketplace = marketplaceFor(currency);
  const accessToken = await ebayToken(deps.fetch, deps.clientId, deps.clientSecret, base);

  let best: Listing[] = [];
  for (const q of buildQueries(car)) {
    const relevant = (await searchEbay(deps.fetch, base, accessToken, q, marketplace)).filter((l) => isRelevant(l.title, car));
    if (relevant.length > best.length) best = relevant;
    if (best.length >= 3) break;
  }
  if (!best.length) throw new HttpError('No current eBay listings found for this car.', 404);

  const converted: Listing[] = [];
  for (const l of best) {
    const rate = await fxRate(deps.fetch, l.currency, currency);
    converted.push({ ...l, price: round2(l.price * rate), currency });
  }
  return summarize(converted, currency);
}

/** For tests. */
export function resetPricingCaches() {
  token = null;
  rates.clear();
}
