# Diecast Collectors

**Scan it. Know it. Track it.** Point your phone at a diecast car. The app identifies the exact release, fills in the
details from the photo plus an online lookup, and tracks what your collection is worth over time.

- **AI scan.** Claude vision reads the car, the card art, base markings and toy numbers. It returns make, model, brand, series, year,
  scale, colour, casting #, packaging, condition, special variants (TH / STH / chase), plus up to 3 alternative matches.
- **Auto-filled from online.** A web-search step confirms the series, year and casting # and prices the car from recent sold and listed
  prices. You get an estimate, a low–high range, a confidence level and source links.
- **Your own value.** Each car has **My value** (your own valuation, which the AI never overwrites) and **Purchase price**, with gain/loss.
- **Value tracking.** Market values are re-checked automatically (weekly, a few cars per launch) or on demand. Each car and the whole
  collection get a value-history chart.
- **Light on typing.** After a scan you review a finished card and tap *Add to Garage*. The full edit form is one tap away but
  never required.
- Garage and wishlist, search, filters, sorting, insights (top cars, gainers and losers, brand breakdown), JSON export/import. Your collection is stored on the device.

See **[docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)** for the full product design: flows, data model, AI design, brand and metrics.

## Repo layout

| Path | What |
|---|---|
| `app/` | Expo (SDK 57) React Native app with TypeScript and Expo Router. Runs on iOS, Android and web. |
| `server/` | Small Node/TypeScript API (Hono) that holds the Anthropic API key and calls Claude. |
| `docs/` | Product spec. |

## Run it

### 1. Server

```bash
cd server
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
npm start                   # http://localhost:8787
npm test                    # unit tests (mocked AI)
```

Endpoints: `POST /api/identify` (photo → identification + valuation), `POST /api/valuate` (details → valuation), `GET /health`.
It uses `claude-opus-5-5` with adaptive thinking and structured outputs, and web search for pricing. If Claude declines a request, the server
automatically falls back to another model. Optional hardening: `APP_SHARED_KEY` (checked against the app's `x-app-key` header) and a per-IP rate limit.

### 2. App

```bash
cd app
npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8787 npx expo start
```

Open it in Expo Go or a development build, or press `w` for web. You can also change the server URL in the app under **Settings → AI server**.

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

Production builds use EAS: `npx eas-cli@latest build -p ios|android`. The app name, icons, bundle id (`com.diecastcollectors.app`) and
permission strings are in `app/app.json`. Brand assets are generated from `app/assets/brand/mark.svg` via
`NODE_PATH=$(npm root -g) node app/assets/brand/render.mjs`.
