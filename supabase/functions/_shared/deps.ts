import { requireUser } from './auth.ts';
import type { Deps } from './handlers.ts';
import { aiErrorToHttp, identifyCar } from './identify.ts';
import { pricingDepsFromEnv, valuateFromEbay } from './pricing.ts';

/** Production wiring for the handlers. */
export function liveDeps(): Deps {
  const pricing = pricingDepsFromEnv();
  return {
    auth: async (req) => {
      const user = await requireUser(req);
      return {
        id: user.id,
        consumeScan: async (limit) => {
          const { data, error } = await user.client.rpc('consume_scan', { p_limit: limit });
          if (error) throw error;
          return data === true;
        },
      };
    },
    identify: async (input) => {
      try {
        return await identifyCar(input);
      } catch (err) {
        throw aiErrorToHttp(err);
      }
    },
    valuate: (car, currency) => valuateFromEbay(car, currency, pricing),
    dailyScanLimit: Number(Deno.env.get('DAILY_SCAN_LIMIT') ?? 40),
  };
}
