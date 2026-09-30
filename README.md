# Diecast Collectors

**Scan it. Know it. Track it.** Point your phone at a diecast car. The app identifies the exact release, fills in the
details, and tracks what your collection is worth over time. Everything is backed up to your account, so switching phones
never loses anything.

- **AI scan.** Claude Haiku 4.5 reads the car, the card art, base markings and toy numbers, and returns make, model, brand,
  series, year, scale, colour, casting #, packaging, condition, special variants (TH / STH / chase), plus up to 3 alternative
  matches. About $0.005 per scan, and **only when you scan**.
- **Free market prices.** Values come from current eBay listings of the same car (median plus a low–high range, with source
  links). Weekly refreshes use no AI and cost nothing.
- **Your own value.** Each car has **My value** (your own valuation, which the AI never overwrites) and **Purchase price**, with gain/loss.
- **Value tracking.** Per-car and whole-collection value history.
- **Safe in the cloud.** Sign in with your email and a 6-digit code (no password). Cars, photos, prices, value history and what
  you paid are uploaded automatically. On a new phone, sign in and it's all back. The app also works offline.
- **Light on typing.** After a scan you review a finished card and tap *Add to Garage*.
- Garage and wishlist, search, filters, sorting, insights, JSON export/import.

**Try it free, no setup:** `artifact/diecast-collectors.html` is a web version published on claude.ai. It uses Claude through your own Claude plan (no API key) and saves your garage to your Claude account.

**Native app setup: [docs/SETUP.md](docs/SETUP.md)** (Supabase, eBay and Anthropic keys, then run on your phone).
Product design: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Repo layout

| Path | What |
|---|---|
| `app/` | Expo (SDK 57) React Native app with TypeScript and Expo Router. Runs on iOS, Android and web. |
| `supabase/migrations/` | Database: `cars` table, photo bucket, per-user security rules, daily scan cap |
| `supabase/functions/` | Edge functions: `identify` (Claude + eBay), `valuate` (eBay only), `delete-account` |
| `supabase/tests/` | Deno tests for the functions, and the schema run against real Postgres (PGlite) |
| `artifact/` | Free web version that runs on claude.ai (Claude for scanning, your Claude account for storage) |
| `docs/` | Setup guide and product spec |

## Development

```bash
# App
cd app && npm install
cp .env.example .env.local        # Supabase URL + key
npx expo start
npm run typecheck && npm run lint && npm test
npm run e2e                        # two-phone sync test against a fake Supabase (needs Playwright + Chromium)

# Backend (Deno)
cd supabase/tests && deno test --allow-env --allow-read .
cd supabase && deno lint functions tests
```
