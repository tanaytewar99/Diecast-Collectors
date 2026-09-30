import Anthropic from '@anthropic-ai/sdk';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { AiError, identifyCar, MODEL, valuateCar } from './ai.js';
import { IdentifyRequest, ValuateRequest } from './schemas.js';

type Deps = {
  identify: typeof identifyCar;
  valuate: typeof valuateCar;
  sharedKey?: string;
  rateLimitPerMinute?: number;
};

export function createApp(deps: Deps = { identify: identifyCar, valuate: valuateCar }) {
  const app = new Hono();
  const limit = deps.rateLimitPerMinute ?? 20;
  const hits = new Map<string, { windowStart: number; count: number }>();

  app.use('*', cors());
  app.use('/api/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }));

  app.use('/api/*', async (c, next) => {
    if (deps.sharedKey && c.req.header('x-app-key') !== deps.sharedKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now - entry.windowStart > 60_000) {
      hits.set(ip, { windowStart: now, count: 1 });
    } else if (++entry.count > limit) {
      return c.json({ error: 'Too many requests. Please wait a minute.' }, 429);
    }
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true, model: MODEL }));

  app.post('/api/identify', async (c) => {
    const body = IdentifyRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'Invalid request', issues: body.error.issues }, 400);
    const { image, mediaType, currency, hint } = body.data;

    try {
      const identification = await deps.identify({ image, mediaType, hint });
      if (!identification.isDiecast) {
        return c.json({ identification, valuation: null, valuationError: null });
      }
      // Identification is useful on its own; a failed valuation shouldn't lose it.
      try {
        const valuation = await deps.valuate(identification.car, currency);
        return c.json({ identification, valuation, valuationError: null });
      } catch (err) {
        console.error('valuation failed', err);
        return c.json({ identification, valuation: null, valuationError: errorMessage(err) });
      }
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post('/api/valuate', async (c) => {
    const body = ValuateRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'Invalid request', issues: body.error.issues }, 400);
    try {
      const valuation = await deps.valuate(body.data.car, body.data.currency);
      return c.json({ valuation });
    } catch (err) {
      return handleError(c, err);
    }
  });

  return app;
}

function errorMessage(err: unknown): string {
  if (err instanceof AiError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return 'The AI service is busy. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

function handleError(c: Context, err: unknown) {
  console.error(err);
  if (err instanceof AiError) return c.json({ error: err.message }, err.status as 422 | 502);
  if (err instanceof Anthropic.RateLimitError) return c.json({ error: errorMessage(err) }, 503);
  if (err instanceof Anthropic.BadRequestError) return c.json({ error: 'The image could not be processed.' }, 400);
  if (err instanceof Anthropic.APIError) return c.json({ error: errorMessage(err) }, 502);
  return c.json({ error: errorMessage(err) }, 500);
}
