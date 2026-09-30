import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AiError, extractValuation } from './ai.js';
import { createApp } from './app.js';
import { Identification, type Valuation } from './schemas.js';

const car = {
  name: "'71 Datsun 510",
  make: 'Datsun',
  model: '510',
  brand: 'Hot Wheels',
  series: 'Car Culture',
  year: 2019,
  scale: '1:64',
  color: 'Blue',
  castingNumber: 'FYN69',
  packaging: 'carded' as const,
  condition: 'mint' as const,
  flags: [],
};

const identification: Identification = {
  isDiecast: true,
  car,
  description: 'A premium Car Culture release.',
  confidence: 0.92,
  evidence: 'Card text',
  alternatives: [],
};

const valuation: Valuation = {
  estimate: 12,
  low: 9,
  high: 15,
  confidence: 'medium',
  rationale: 'Recent eBay sales.',
  sources: [{ title: 'eBay', url: 'https://ebay.com/x' }],
  corrections: { series: null, year: null, castingNumber: null },
};

const image = 'a'.repeat(200);
const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('identify returns identification and valuation', async () => {
  const app = createApp({ identify: async () => identification, valuate: async () => valuation });
  const res = await post(app, '/api/identify', { image, currency: 'USD' });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.identification.car.name, "'71 Datsun 510");
  assert.equal(json.valuation.estimate, 12);
});

test('identify still returns the car when valuation fails', async () => {
  const app = createApp({
    identify: async () => identification,
    valuate: async () => {
      throw new AiError('Could not determine a market value right now.');
    },
  });
  const res = await post(app, '/api/identify', { image });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.valuation, null);
  assert.equal(json.valuationError, 'Could not determine a market value right now.');
  assert.equal(json.identification.car.brand, 'Hot Wheels');
});

test('identify skips valuation for non-diecast photos', async () => {
  let valuated = false;
  const app = createApp({
    identify: async () => ({ ...identification, isDiecast: false }),
    valuate: async () => {
      valuated = true;
      return valuation;
    },
  });
  const res = await post(app, '/api/identify', { image });
  assert.equal((await res.json()).identification.isDiecast, false);
  assert.equal(valuated, false);
});

test('rejects invalid bodies, bad keys and floods', async () => {
  const deps = { identify: async () => identification, valuate: async () => valuation };
  assert.equal((await post(createApp(deps), '/api/identify', { image: 'x' })).status, 400);
  assert.equal((await post(createApp(deps), '/api/valuate', { car: { name: 'x' } })).status, 400);

  const locked = createApp({ ...deps, sharedKey: 'secret' });
  assert.equal((await post(locked, '/api/valuate', { car })).status, 401);
  assert.equal((await post(locked, '/api/valuate', { car }, { 'x-app-key': 'secret' })).status, 200);

  const limited = createApp({ ...deps, rateLimitPerMinute: 2 });
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await post(limited, '/api/valuate', { car })).status);
  assert.deepEqual(statuses, [200, 200, 429]);
});

test('AI errors map to their status codes', async () => {
  const app = createApp({
    identify: async () => {
      throw new AiError('declined', 422);
    },
    valuate: async () => valuation,
  });
  const res = await post(app, '/api/identify', { image });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'declined');
});

test('extractValuation validates and normalises the tool call', () => {
  const out = extractValuation([
    {
      type: 'tool_use',
      id: 't1',
      name: 'submit_valuation',
      input: {
        ...valuation,
        estimate: 20.456,
        low: 25, // inconsistent: above estimate
        sources: [...valuation.sources, { title: 'bad', url: 'javascript:alert(1)' }],
      },
    } as never,
  ]);
  assert.ok(out);
  assert.equal(out.estimate, 20.46);
  assert.equal(out.low, 20.46);
  assert.equal(out.high, 20.46);
  assert.equal(out.sources.length, 1);

  assert.equal(extractValuation([{ type: 'text', text: 'hi', citations: null } as never]), null);
  assert.equal(
    extractValuation([{ type: 'tool_use', id: 't', name: 'submit_valuation', input: { estimate: 'x' } } as never]),
    null,
  );
});

test('identification schema converts to a strict JSON schema', () => {
  const format = betaZodOutputFormat(Identification);
  const schema = format.schema as { additionalProperties?: boolean; required?: string[] };
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required?.includes('car'));
});
