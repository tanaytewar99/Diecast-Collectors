export type CarStatus = 'owned' | 'wishlist';
export type Packaging = 'carded' | 'boxed' | 'loose' | 'unknown';
export type Condition = 'mint' | 'near_mint' | 'good' | 'fair' | 'poor' | 'unknown';

/** Identification fields: filled by the AI, editable by the user. Mirrors the server's CarDetails. */
export interface CarDetails {
  name: string;
  make: string | null;
  model: string | null;
  brand: string | null;
  series: string | null;
  year: number | null;
  scale: string | null;
  color: string | null;
  castingNumber: string | null;
  packaging: Packaging;
  condition: Condition;
  flags: string[];
}

export interface Source {
  title: string;
  url: string;
}

export interface MarketValue {
  estimate: number;
  low: number;
  high: number;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
  sources: Source[];
  checkedAt: string;
}

export interface ValuePoint {
  date: string;
  estimate: number;
  low: number;
  high: number;
}

export interface Car extends CarDetails {
  id: string;
  status: CarStatus;
  /** Photo on this device (file URI, or data URI on web). Never synced. */
  photoUri: string | null;
  /** Photo in cloud storage ("<user id>/<car id>.jpg"), null until uploaded. */
  photoPath: string | null;
  createdAt: string;
  updatedAt: string;
  description: string | null;
  aiConfidence: number | null;

  currency: string;
  purchasePrice: number | null;
  /** The collector's own valuation. Never written by the AI. */
  myValue: number | null;
  market: MarketValue | null;
  valueHistory: ValuePoint[];
  myValueHistory: { date: string; value: number }[];
  notes: string | null;
}

// ---- API shapes ----

export interface Identification {
  isDiecast: boolean;
  car: CarDetails;
  description: string;
  confidence: number;
  evidence: string;
  alternatives: {
    name: string;
    brand: string | null;
    series: string | null;
    year: number | null;
    color: string | null;
  }[];
}

export interface Valuation {
  estimate: number;
  low: number;
  high: number;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
  sources: Source[];
  currency: string;
  listingsCount: number;
}

export interface IdentifyResponse {
  identification: Identification;
  valuation: Valuation | null;
  valuationError: string | null;
}
