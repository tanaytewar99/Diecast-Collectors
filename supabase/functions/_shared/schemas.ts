import { z } from 'zod';

export const PACKAGING = ['carded', 'boxed', 'loose', 'unknown'] as const;
export const CONDITION = ['mint', 'near_mint', 'good', 'fair', 'poor', 'unknown'] as const;
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'] as const;
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

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
  castingNumber: z.string().nullable().describe('Toy number / collector number / SKU if visible, e.g. "GRJ83" or "123/250"'),
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

export interface Valuation {
  estimate: number;
  low: number;
  high: number;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
  sources: { title: string; url: string }[];
  currency: string;
  listingsCount: number;
}

export const IdentifyRequest = z.object({
  image: z.string().min(100).max(8_000_000),
  mediaType: z.enum(MEDIA_TYPES).default('image/jpeg'),
  currency: z.enum(CURRENCIES).default('USD'),
  hint: z.string().max(200).optional(),
});

export const ValuateRequest = z.object({
  car: CarDetails,
  currency: z.enum(CURRENCIES).default('USD'),
});
