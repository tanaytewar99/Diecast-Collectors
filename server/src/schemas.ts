import * as z from 'zod/v4';

export const PACKAGING = ['carded', 'boxed', 'loose', 'unknown'] as const;
export const CONDITION = ['mint', 'near_mint', 'good', 'fair', 'poor', 'unknown'] as const;

/** Fields that describe *which* car this is. Shared by identify output and valuate input. */
export const CarDetails = z.object({
  name: z.string().describe("Collector-facing name of the casting, e.g. \"'71 Datsun 510\""),
  make: z.string().nullable().describe('Real-world car manufacturer, e.g. "Datsun"'),
  model: z.string().nullable().describe('Real-world car model, e.g. "510 Wagon"'),
  brand: z.string().nullable().describe('Diecast brand, e.g. "Hot Wheels", "Matchbox", "Mini GT", "Tomica"'),
  series: z.string().nullable().describe('Line / series / sub-series, e.g. "Car Culture: Japan Historics 3"'),
  year: z.number().int().nullable().describe('Release year of this diecast (not the real car)'),
  scale: z.string().nullable().describe('e.g. "1:64"'),
  color: z.string().nullable(),
  castingNumber: z
    .string()
    .nullable()
    .describe('Toy number / collector number / SKU if known, e.g. "GRJ83" or "123/250"'),
  packaging: z.enum(PACKAGING),
  condition: z.enum(CONDITION),
  flags: z
    .array(z.string())
    .describe('Special variants: "Treasure Hunt", "Super Treasure Hunt", "Chase", "Limited Edition", "Real Riders", "Error"'),
});
export type CarDetails = z.infer<typeof CarDetails>;

export const Identification = z.object({
  isDiecast: z.boolean().describe('false if the photo does not show a scale model / diecast vehicle'),
  car: CarDetails,
  description: z.string().describe('1-3 sentence collector-oriented description of this release'),
  confidence: z.number().describe('0..1 confidence in the exact identification'),
  evidence: z.string().describe('What in the photo the identification is based on (card text, base, tampos, wheels)'),
  alternatives: z
    .array(
      z.object({
        name: z.string(),
        brand: z.string().nullable(),
        series: z.string().nullable(),
        year: z.number().int().nullable(),
        color: z.string().nullable(),
      }),
    )
    .describe('Up to 3 other plausible matches, most likely first'),
});
export type Identification = z.infer<typeof Identification>;

export const Valuation = z.object({
  estimate: z.number(),
  low: z.number(),
  high: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  // Details the lookup confirmed or corrected (null = no change).
  corrections: z.object({
    series: z.string().nullable(),
    year: z.number().int().nullable(),
    castingNumber: z.string().nullable(),
  }),
});
export type Valuation = z.infer<typeof Valuation>;

const nullableString = { type: ['string', 'null'] };
const nullableInt = { type: ['integer', 'null'] };

/** Strict JSON schema for the submit_valuation tool (mirrors `Valuation`). */
export const valuationToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['estimate', 'low', 'high', 'confidence', 'rationale', 'sources', 'corrections'],
  properties: {
    estimate: { type: 'number', description: 'Best single estimate of current market value' },
    low: { type: 'number', description: 'Low end of the realistic range' },
    high: { type: 'number', description: 'High end of the realistic range' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    rationale: {
      type: 'string',
      description: '1-3 sentences: what the estimate is based on (sold vs listed, condition, packaging)',
    },
    sources: {
      type: 'array',
      description: 'Up to 5 pages actually used for pricing',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url'],
        properties: { title: { type: 'string' }, url: { type: 'string' } },
      },
    },
    corrections: {
      type: 'object',
      additionalProperties: false,
      required: ['series', 'year', 'castingNumber'],
      description: 'Details confirmed by the search that differ from or fill gaps in the input; null when unchanged',
      properties: { series: nullableString, year: nullableInt, castingNumber: nullableString },
    },
  },
} as const;

export const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export const IdentifyRequest = z.object({
  image: z.string().min(100).max(8_000_000),
  mediaType: z.enum(SUPPORTED_MEDIA_TYPES).default('image/jpeg'),
  currency: z.string().length(3).default('USD'),
  hint: z.string().max(200).optional(),
});

export const ValuateRequest = z.object({
  car: CarDetails,
  currency: z.string().length(3).default('USD'),
});
