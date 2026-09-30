// deno-lint-ignore-file require-await -- test fakes mirror async interfaces
import assert from 'node:assert/strict';
import { HttpError } from '../functions/_shared/http.ts';
import { identifyHandler, valuateHandler, type Deps } from '../functions/_shared/handlers.ts';
import {
  buildQueries,
  isRelevant,
  nameTokens,
  resetPricingCaches,
  summarize,
  valuateFromEbay,
  type Listing,
} from '../functions/_shared/pricing.ts';
import type { CarDetails, Identification, Valuation } from '../functions/_shared/schemas.ts';

const car: CarDetails = {
  name: "'71 Datsun 510",
  make: 'Datsun',
  model: '510',
  brand: 'Hot Wheels',
  series: 'Car Culture',
  year: 2020,
  scale: '1:64',
  color: 'Blue',
  castingNumber: null,
  packaging: 'carded',
  condition: 'mint',
  flags: [],
};

// ---------------------------------------------------------------- pricing

Deno.test('name tokens and queries', () => {
  assert.deepEqual(nameTokens("'71 Datsun 510"), ['71', 'datsun', '510']);
  const qs = buildQueries(car);
  assert.equal(qs[0], 'Hot Wheels 71 datsun 510 2020');
  assert.equal(qs.at(-1), '71 datsun 510 diecast');
  assert.match(buildQueries({ ...car, flags: ['Super Treasure Hunt'] })[0], /super treasure hunt/);
});

Deno.test('relevance filter keeps like-for-like single cars', () => {
  assert.ok(isRelevant("Hot Wheels Car Culture '71 Datsun 510 Blue Real Riders", car));
  assert.ok(isRelevant('HW 71 Datsun 510 Japan Historics', car));
  assert.equal(isRelevant('Hot Wheels lot of 10 cars Datsun 510', car), false, 'lots');
  assert.equal(isRelevant('Hot Wheels Datsun 510 5-pack', car), false, 'multipacks');
  assert.equal(isRelevant('Matchbox 71 Datsun 510', car), false, 'wrong brand');
  assert.equal(isRelevant('Hot Wheels Nissan Skyline', car), false, 'wrong car');
  assert.equal(isRelevant('Hot Wheels 2020 Super Treasure Hunt 71 Datsun 510 STH', car), false, 'STH vs regular');
  const sth = { ...car, flags: ['Super Treasure Hunt'] };
  assert.ok(isRelevant('Hot Wheels 2020 Super Treasure Hunt 71 Datsun 510', sth));
  assert.equal(isRelevant("Hot Wheels '71 Datsun 510", sth), false, 'regular vs STH');
});

Deno.test('summarize: median, IQR range, outliers dropped', () => {
  const l = (price: number): Listing => ({ title: 't', price, currency: 'USD', url: `https://e/${price}` });
  const v = summarize([9, 10, 11, 12, 12, 13, 14, 15, 16, 18, 400].map(l), 'USD');
  assert.equal(v.listingsCount, 10, '400 is an outlier');
  assert.equal(v.estimate, 12.5); // median of 9..18
  assert.ok(v.low <= v.estimate && v.estimate <= v.high);
  assert.equal(v.confidence, 'high');
  assert.equal(v.sources.length, 5);
  assert.equal(summarize([l(7)], 'USD').confidence, 'low');
});

function fakeEbay(listings: { title: string; value: string; currency?: string }[], opts: { fxRate?: number } = {}) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/oauth2/token')) {
      assert.match(String(new Headers(init?.headers).get('authorization')), /^Basic /);
      return Response.json({ access_token: 'tok', expires_in: 7200 });
    }
    if (url.includes('/item_summary/search')) {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer tok');
      return Response.json({
        itemSummaries: listings.map((x, i) => ({
          title: x.title,
          price: { value: x.value, currency: x.currency ?? 'USD' },
          itemWebUrl: `https://www.ebay.com/itm/${i}`,
        })),
      });
    }
    if (url.includes('frankfurter')) return Response.json({ rates: { INR: opts.fxRate ?? 80 } });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetch: f, calls };
}

Deno.test('valuateFromEbay searches, filters and summarises', async () => {
  resetPricingCaches();
  const ebay = fakeEbay([
    { title: "Hot Wheels '71 Datsun 510 Car Culture", value: '14.99' },
    { title: 'Hot Wheels 71 Datsun 510 blue', value: '12.00' },
    { title: 'HW Datsun 510 71 Japan Historics', value: '16.50' },
    { title: 'Hot Wheels lot 20 cars', value: '3.00' },
  ]);
  const v = await valuateFromEbay(car, 'USD', { fetch: ebay.fetch, clientId: 'id', clientSecret: 'secret' });
  assert.equal(v.listingsCount, 3);
  assert.equal(v.estimate, 14.99);
  assert.equal(v.currency, 'USD');
  const search = ebay.calls.find((c) => c.includes('item_summary'))!;
  assert.match(search, /category_ids=222/);
  assert.match(decodeURIComponent(search), /buyingOptions:\{FIXED_PRICE\}/);
  // Stopped after the first query had enough results.
  assert.equal(ebay.calls.filter((c) => c.includes('item_summary')).length, 1);
});

Deno.test('valuateFromEbay converts currencies without a local eBay', async () => {
  resetPricingCaches();
  const ebay = fakeEbay(
    [
      { title: "Hot Wheels '71 Datsun 510", value: '10' },
      { title: "Hot Wheels '71 Datsun 510", value: '12' },
      { title: "Hot Wheels '71 Datsun 510", value: '14' },
    ],
    { fxRate: 80 },
  );
  const v = await valuateFromEbay(car, 'INR', { fetch: ebay.fetch, clientId: 'id', clientSecret: 'secret' });
  assert.equal(v.estimate, 960);
  assert.equal(v.currency, 'INR');
});

Deno.test('valuateFromEbay reports when nothing matches or keys are missing', async () => {
  resetPricingCaches();
  const ebay = fakeEbay([{ title: 'Something else entirely', value: '5' }]);
  await assert.rejects(valuateFromEbay(car, 'USD', { fetch: ebay.fetch, clientId: 'id', clientSecret: 's' }), (e) => {
    assert.ok(e instanceof HttpError && e.status === 404);
    return true;
  });
  await assert.rejects(valuateFromEbay(car, 'USD', null), /not set up/);
});

// ---------------------------------------------------------------- handlers

const identification: Identification = {
  isDiecast: true,
  car,
  description: 'd',
  confidence: 0.9,
  evidence: 'e',
  alternatives: [],
};
const valuation: Valuation = {
  estimate: 12,
  low: 10,
  high: 15,
  confidence: 'medium',
  rationale: 'r',
  sources: [],
  currency: 'USD',
  listingsCount: 5,
};

function deps(over: Partial<Deps> = {}, budget = { used: 0 }): Deps {
  return {
    auth: async (req) => {
      if (req.headers.get('Authorization') !== 'Bearer good') throw new HttpError('Please sign in.', 401);
      return { id: 'u1', consumeScan: async (limit) => ++budget.used <= limit };
    },
    identify: async () => identification,
    valuate: async () => valuation,
    dailyScanLimit: 2,
    ...over,
  };
}

const post = (body: unknown, token = 'good') =>
  new Request('http://x', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const image = 'a'.repeat(200);

Deno.test('identify: happy path, auth, validation, daily limit', async () => {
  const h = identifyHandler(deps());
  const ok = await h(post({ image, currency: 'USD' }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.identification.car.name, "'71 Datsun 510");
  assert.equal(body.valuation.estimate, 12);

  assert.equal((await h(post({ image }, 'bad'))).status, 401);
  assert.equal((await h(post({ image: 'x' }))).status, 400);
  assert.equal((await h(post({ image }))).status, 200);
  const limited = await h(post({ image }));
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /Daily scan limit/);
  assert.equal((await h(new Request('http://x', { method: 'OPTIONS' }))).status, 200);
});

Deno.test('identify keeps the car when pricing fails, skips pricing for non-cars', async () => {
  const noPrice = identifyHandler(deps({ valuate: () => Promise.reject(new HttpError('No current eBay listings found for this car.', 404)) }));
  const body = await (await noPrice(post({ image }))).json();
  assert.equal(body.valuation, null);
  assert.equal(body.valuationError, 'No current eBay listings found for this car.');
  assert.equal(body.identification.car.brand, 'Hot Wheels');

  let priced = false;
  const notCar = identifyHandler(
    deps({ identify: async () => ({ ...identification, isDiecast: false }), valuate: async () => ((priced = true), valuation) }),
  );
  assert.equal((await (await notCar(post({ image }))).json()).identification.isDiecast, false);
  assert.equal(priced, false);
});

Deno.test('valuate does not use the scan budget', async () => {
  const budget = { used: 0 };
  const h = valuateHandler(deps({}, budget));
  for (let i = 0; i < 5; i++) assert.equal((await h(post({ car, currency: 'GBP' }))).status, 200);
  assert.equal(budget.used, 0);
  assert.equal((await h(post({ car: { name: 1 } }))).status, 400);
});
