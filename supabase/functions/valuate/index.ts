// POST { car, currency } -> { valuation }   (eBay listings, no AI)
import { liveDeps } from '../_shared/deps.ts';
import { valuateHandler } from '../_shared/handlers.ts';

Deno.serve(valuateHandler(liveDeps()));
