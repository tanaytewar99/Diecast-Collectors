// POST { image, mediaType, currency, hint? } -> { identification, valuation, valuationError }
import { liveDeps } from '../_shared/deps.ts';
import { identifyHandler } from '../_shared/handlers.ts';

Deno.serve(identifyHandler(liveDeps()));
