# Diecast Collectors — Product Spec

> Scan a diecast car, and the app identifies it, fills in the details, and tracks what it's worth.

## 1. Background and positioning

CarLect showed there's demand for a "point your camera at a diecast car and catalogue it" app. It focuses on
collection management and identification. **Diecast Collectors** starts from the same idea and makes
**value** a first-class feature:

| | CarLect-style apps | Diecast Collectors |
|---|---|---|
| Identify by photo | ✅ | ✅ AI vision (Claude) identifies make, model, brand, series, year, casting, variant |
| Auto-filled details | Partial | ✅ Nearly every field comes from the scan plus an online lookup |
| Market value | Limited / none | ✅ Estimated from live web listings and sold prices, with a low–high range and sources |
| Value over time | ❌ | ✅ Periodic re-valuation builds a history chart per car and for the whole collection |
| **My value** (collector's own valuation) | ❌ | ✅ A dedicated field, shown next to market value |
| Purchase price and gain/loss | ❌ | ✅ |
| Manual data entry | Heavy | Minimal: review, then save. Editing is available but never required |

## 2. Target users

1. **Casual collector** (Hot Wheels / Matchbox mainline, 20–300 cars). Wants to know "what is this and is it worth
   anything?" Low tolerance for typing.
2. **Serious collector** (premium lines such as Mini GT, Tomica Limited Vintage, AutoArt, Kyosho, and Super Treasure Hunts;
   300–5,000 cars). Cares about exact variant, condition, packaging and value. Wants to record their own
   valuation, because the market estimate doesn't always reflect rarity or condition.
3. **Flipper / reseller.** Cares about purchase price vs. current value and ROI.

## 3. Product principles

1. **Scan-first, type-last.** The camera is the main way to add a car. Every field that can be inferred is inferred.
2. **Review, don't fill.** After a scan the user sees a finished card. Saving takes one tap. Editing sits behind an
   explicit "Edit details" action and is never on the main path.
3. **Only two inputs are asked for up front:** *My value* and *Purchase price*. The AI can't know them, and they matter most for
   value tracking. Both are optional.
4. **Show the evidence behind a value.** Every market value shows a range, a confidence level, the date it was checked, and source links.
5. **Local-first.** The collection lives on the device and works offline. The network is only used to scan and refresh values.

## 4. Core user flows

### 4.1 Scan → add (primary flow, target < 15 s)
1. The user taps the big **Scan** button (center tab).
2. A camera viewfinder opens with a framing guide ("Fit the car, or the card, in the frame"). The user can also pick an image from the gallery.
3. The user takes the photo. An "Identifying…" state appears with the photo and an animated progress message:
   *Identifying car → Looking up details → Checking market prices*.
4. The **Scan Result** screen shows:
   - Photo, **name** (e.g. "'71 Datsun 510"), brand and series chips, year, scale, colour.
   - A **Market value** card with estimate, range, confidence, and sources.
   - The AI's confidence. Up to 3 **alternative matches** can be tapped to swap.
   - Two quick inputs: **My value** and **Purchase price** (currency inputs, optional).
   - A toggle: **In my Garage** / **Wishlist**.
   - Buttons: **Add to Garage** (primary), **Edit details** (secondary), **Retake**.
5. The car is saved and the user lands on its detail page.

When the AI isn't confident (< 0.5), the result screen shows a banner: *"Not sure about this one. Check the details or
pick an alternative."* The user can still save.

When the scan fails (no car found or network error), the user can retry or add the car manually. The manual form is the
same edit form.

### 4.2 Browse the garage
- A header shows **Collection value** as a large number (the sum of *effective value*, see §5.2), with change since last month and
  total invested (sum of purchase prices).
- Search bar plus filter chips: All / Garage / Wishlist / brand.
- Sort: recently added, value (high→low), name, gain.
- Grid of cards: photo, name, brand, effective value, and a small ▲/▼ badge.

### 4.3 Car detail
- Hero photo, name, brand · series · year.
- **Value panel** (the main panel):
  - *My value* (editable inline, tap to set). If set, this is the headline value.
  - *Market value*: estimate, range, "Updated 3 days ago", ↻ refresh.
  - *Purchase price* (editable inline) and *Gain/loss* (value − purchase price, as an amount and %).
  - A value-history line chart of market value snapshots, with the user's own value as a dashed line.
  - Sources: up to 5 links from the last valuation.
- **Details** (read-only list): brand, series, year, scale, colour, casting number / toy number, packaging,
  condition, special flags (Treasure Hunt, Super TH, Chase, Limited Edition), and description.
- **Edit details** opens the full edit form. **Delete** sits in the overflow.

### 4.4 Value tracking
- Each saved car keeps a list of `valueHistory` snapshots `{date, estimate, low, high}`.
- **Automatic refresh:** when the app opens, cars whose market value is more than 7 days old are re-valued in the background,
  up to 5 per session, oldest first. This keeps API cost bounded.
- **Manual refresh:** ↻ on a car, or "Refresh all" on the Insights tab (with a warning if there are more than 20 cars).
- My value changes are also kept (`myValueHistory`) so the chart can show them.

### 4.5 Insights tab
- Collection value over time (sum of each car's latest snapshot per day).
- Totals: cars owned, wishlist count, invested, market value, my value, unrealised gain.
- Top 5 most valuable cars. Top gainers and losers vs. purchase price.
- Brand breakdown (count and value per brand).

### 4.6 Settings
- Currency (USD default; EUR, GBP, INR, JPY, CAD, AUD). Valuations are requested in this currency.
- Auto-refresh values on/off.
- Server URL (for self-hosting or dev).
- Export collection (JSON share), import JSON, erase all data.
- About: version and brand.

## 5. Data model (on-device)

```ts
type CarStatus = 'owned' | 'wishlist';

interface Car {
  id: string;
  status: CarStatus;
  photoUri: string | null;          // local file copy
  createdAt: string; updatedAt: string;

  // Identification (filled by AI, editable)
  name: string;                     // "'71 Datsun 510"
  make: string | null;              // real-car manufacturer, e.g. "Datsun"
  model: string | null;             // "510"
  brand: string | null;             // diecast brand, e.g. "Hot Wheels"
  series: string | null;            // "Car Culture: Japan Historics"
  year: number | null;              // release year of the diecast
  scale: string | null;             // "1:64"
  color: string | null;
  castingNumber: string | null;     // toy / collector number, e.g. "GJT68" or "123/250"
  packaging: 'carded' | 'boxed' | 'loose' | 'unknown';
  condition: 'mint' | 'near_mint' | 'good' | 'fair' | 'poor' | 'unknown';
  flags: string[];                  // ["Treasure Hunt", "Super Treasure Hunt", "Chase", "Limited Edition", "Real Riders"]
  description: string | null;
  aiConfidence: number | null;      // 0..1

  // Value
  currency: string;
  purchasePrice: number | null;
  myValue: number | null;           // user's own valuation (never overwritten by AI)
  market: {
    estimate: number; low: number; high: number;
    confidence: 'low' | 'medium' | 'high';
    rationale: string; sources: {title: string; url: string}[];
    checkedAt: string;
  } | null;
  valueHistory: {date: string; estimate: number; low: number; high: number}[];
  myValueHistory: {date: string; value: number}[];
  notes: string | null;
}
```

### 5.1 Editing rules
- AI-filled fields can be edited. After an edit the field is treated as user data, and re-valuation uses the edited value.
- `myValue`, `purchasePrice` and `notes` are **never** written by the AI.
- Re-valuation only updates `market` and appends to `valueHistory`. It never changes identification fields.

### 5.2 Effective value
`effectiveValue = myValue ?? market.estimate ?? 0`. The user's own valuation wins. This keeps a collector's knowledge (rarity, condition) authoritative
while market data is still shown next to it.

## 6. AI system

A thin backend (`/server`) holds the Anthropic API key. The key never ships in the app.

| Endpoint | Input | What it does |
|---|---|---|
| `POST /api/identify` | `{image (base64), mediaType, currency}` | **Step 1: Vision.** Claude reads the photo (car, card art, base text, toy numbers) and returns structured identification + alternatives. **Step 2: Enrich and value.** Claude uses web search to confirm the series/year/casting number and to find current listings and sold prices, then returns a structured valuation with sources. |
| `POST /api/valuate` | `{car details, currency}` | Step 2 only. Used for re-valuation. |
| `GET /health` | – | Liveness check. |

- Model: `claude-opus-5-5` with adaptive thinking; server-side web search (`web_search_20260209`).
- Output: strict JSON schemas (structured outputs for identification, and a strict `submit_valuation` tool for the web-search valuation step).
- Safety and cost: images are resized on-device to ≤ 1568px JPEG before upload. Web search is capped at `max_uses: 5` per valuation.
  A simple per-IP rate limit runs on the server. An optional `APP_SHARED_KEY` header check blocks casual abuse.
- Failure behaviour: if the valuation fails but identification succeeds, the car is still returned with `market: null`, and the
  app shows "Value unavailable, tap to retry".

## 7. Brand

- **Name:** Diecast Collectors
- **Tagline:** "Scan it. Know it. Track it."
- **Palette:** Racing Red `#E10600` (primary), Asphalt `#15171C` (background), Graphite `#23262E` (surfaces),
  Chrome `#C9CED6` (secondary text), Podium Gold `#F5B400` (value/gains), Green `#22C55E` / Red `#EF4444` (up/down).
- **Tone:** enthusiastic but precise, speaking as one collector to another.
- **Icon:** a white 1:64 car silhouette inside scan-frame corners on Racing Red (`app/assets/brand/mark.svg`).

## 8. Success metrics

- Scan → saved conversion ≥ 70%.
- Median time from scan to saved ≤ 15 s.
- ≤ 20% of saved cars have identification fields edited (a proxy for AI accuracy).
- Share of owned cars with *My value* or *Purchase price* set ≥ 40% (value-tracking engagement).
- D30 retention ≥ 25%.

## 9. Roadmap

- **v1 (this build):** scan and identify, auto-fill, market valuation with sources, my value and purchase price, value history,
  garage and wishlist, insights, JSON export/import, local-first storage.
- **v1.1:** multiple photos per car, barcode scan of card UPCs, batch scan (several cars in one photo), CSV export.
- **v2:** accounts and cloud sync, price alerts ("your STH is up 20%"), sharing a public garage, community corrections to IDs.

## 10. Out of scope for v1
Accounts and cloud sync, marketplace and trading, social feed, and ads.
