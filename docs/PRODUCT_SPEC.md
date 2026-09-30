# Diecast Collectors — Product Spec

> Scan a diecast car, and the app identifies it, fills in the details, and tracks what it's worth.

## 1. Background and positioning

CarLect showed there's demand for a "point your camera at a diecast car and catalogue it" app. It focuses on
collection management and identification. **Diecast Collectors** starts from the same idea and makes
**value** a first-class feature:

| | CarLect-style apps | Diecast Collectors |
|---|---|---|
| Identify by photo | ✅ | ✅ AI vision (Claude Haiku) identifies make, model, brand, series, year, casting, variant |
| Auto-filled details | Partial | ✅ Nearly every field comes from the scan; prices come from live eBay listings |
| Market value | Limited / none | ✅ Estimated from current eBay listings of the same car, with a low–high range and sources (free, no AI) |
| Value over time | ❌ | ✅ Periodic re-valuation builds a history chart per car and for the whole collection |
| **My value** (collector's own valuation) | ❌ | ✅ A dedicated field, shown next to market value |
| Purchase price and gain/loss | ❌ | ✅ |
| Manual data entry | Heavy | Minimal: review, then save. Editing is available but never required |
| Backup & switching phones | Varies | ✅ Automatic cloud backup of everything (photos, prices, history); sign in on a new phone and it is all there |

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
5. **Never lose a collection.** Everything is backed up to the user's account automatically, and the phone keeps a full copy so the app works offline.
6. **Near-zero running cost.** AI is used once per car, when it's scanned, on the cheapest capable model. Everything else (prices, refreshes, sync) is free.

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
  up to 25 per session, oldest first. Refreshes use eBay listings only (no AI), so they are free.
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
- Account & backup: signed-in email, sync status ("All changes saved to the cloud"), Sync now, Sign out.
- Export collection (JSON share) as an extra personal copy, import JSON, delete account (removes all cloud data).
- About: version and brand.

## 5. Data model (on-device, mirrored to the cloud)

```ts
type CarStatus = 'owned' | 'wishlist';

interface Car {
  id: string;
  status: CarStatus;
  photoUri: string | null;          // photo on this device (not synced)
  photoPath: string | null;         // photo in cloud storage
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

## 6. Accounts, sync and backend

### 6.1 Accounts and cloud sync (Supabase)
- **Sign-in:** email plus a 6-digit one-time code. There's no password, so users can always get back in on a new phone. Sign-in is required, so every
  collection is backed up from the first car.
- **Cloud copy:** each car is one JSON row in `cars` (Postgres), including details, prices, `valueHistory`, `myValue`, `purchasePrice`
  and notes. Photos live in the private `car-photos` bucket under `<user id>/<car id>.jpg`. Row-level security limits every
  account to its own rows and files.
- **Sync engine (app):** local-first. Every change marks the car *dirty*, and ~1.5 s later the app uploads photos, then cars, then
  deletions, and pulls changes from other devices (`synced_at > last pull`). It also syncs on sign-in and when the app returns to the
  foreground. Conflicts go to the most recent edit, enforced in the app and by a database trigger that ignores stale writes.
- **New phone:** sign in, then everything is pulled down and photos are downloaded into local storage.
- **Account deletion:** the `delete-account` function removes photos and the user. Cars cascade. (App stores require this.)
- The currency preference is stored in the account's metadata so it follows the user.

### 6.2 AI and pricing (Supabase Edge Functions)
The Anthropic and eBay keys live only in Supabase secrets, never in the app.

| Function | Input | What it does | Cost |
|---|---|---|---|
| `identify` | `{image (base64), mediaType, currency}` | **Claude Haiku 4.5** reads the photo (card art, base text, toy numbers) and returns a structured identification plus alternatives, then prices it via eBay | ~$0.005 per scan |
| `valuate` | `{car details, currency}` | eBay Browse API: current buy-it-now listings, relevance-filtered (no lots, customs or multipacks; TH/STH only matched like-for-like), outliers removed, median plus interquartile range. Other currencies are converted with ECB rates (Frankfurter). | free |
| `delete-account` | – | Deletes the caller's photos and account | free |

- Every function requires a signed-in user. `identify` is capped per user per day (`DAILY_SCAN_LIMIT`, default 40) via
  `consume_scan()`, so AI spend can't run away.
- Failure behaviour: if pricing fails but identification succeeds, the car is still returned with `market: null`, and the app
  shows "Value unavailable, tap to retry".

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
  garage and wishlist, insights, JSON export/import, accounts with automatic cloud backup and multi-device sync.
- **v1.1:** batch import (pick many photo-box shots at once and review them as a queue), multiple photos per car, barcode scan
  of card UPCs, CSV export, Google/Apple sign-in.
- **v2:** price alerts ("your STH is up 20%"), sharing a public garage, community corrections to IDs, sold-price data.

## 10. Out of scope for v1
Marketplace and trading, social feed, and ads.
