import { handler, HttpError, json, readJson } from './http.ts';
import { IdentifyRequest, ValuateRequest, type CarDetails, type Identification, type MEDIA_TYPES, type Valuation } from './schemas.ts';

export interface Caller {
  id: string;
  /** Count one AI scan against today's budget; false when over the limit. */
  consumeScan: (limit: number) => Promise<boolean>;
}

export interface Deps {
  auth: (req: Request) => Promise<Caller>;
  identify: (input: { image: string; mediaType: MediaType; hint?: string }) => Promise<Identification>;
  valuate: (car: CarDetails, currency: string) => Promise<Valuation>;
  dailyScanLimit: number;
}
type MediaType = (typeof MEDIA_TYPES)[number];

const message = (err: unknown) => (err instanceof HttpError ? err.message : 'Value unavailable right now.');

/** Photo -> identification (AI, counted against the daily budget) + market value (eBay, free). */
export function identifyHandler(deps: Deps) {
  return handler(async (req) => {
    const caller = await deps.auth(req);
    const body = IdentifyRequest.safeParse(await readJson(req));
    if (!body.success) return json({ error: 'Invalid request' }, 400);

    if (!(await caller.consumeScan(deps.dailyScanLimit))) {
      throw new HttpError(`Daily scan limit reached (${deps.dailyScanLimit}). Try again tomorrow.`, 429);
    }
    const { image, mediaType, currency, hint } = body.data;
    const identification = await deps.identify({ image, mediaType, hint });
    if (!identification.isDiecast) return json({ identification, valuation: null, valuationError: null });

    // A car without a price is still worth saving.
    try {
      const valuation = await deps.valuate(identification.car, currency);
      return json({ identification, valuation, valuationError: null });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error('valuation failed', err);
      return json({ identification, valuation: null, valuationError: message(err) });
    }
  });
}

/** Car details -> market value (eBay, free). Used for refreshes. */
export function valuateHandler(deps: Deps) {
  return handler(async (req) => {
    await deps.auth(req);
    const body = ValuateRequest.safeParse(await readJson(req));
    if (!body.success) return json({ error: 'Invalid request' }, 400);
    const valuation = await deps.valuate(body.data.car, body.data.currency);
    return json({ valuation });
  });
}
