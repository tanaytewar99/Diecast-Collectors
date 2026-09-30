import { serve } from '@hono/node-server';
import { identifyCar, valuateCar } from './ai.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const app = createApp({
  identify: identifyCar,
  valuate: valuateCar,
  sharedKey: process.env.APP_SHARED_KEY || undefined,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 20),
});

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Diecast Collectors API listening on http://localhost:${info.port}`);
});
