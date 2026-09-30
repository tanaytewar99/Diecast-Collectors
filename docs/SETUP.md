# Setting up Diecast Collectors

About 30–45 minutes, once. You need three accounts:

| Service | What it does | Cost |
|---|---|---|
| **Supabase** | Your account and sign-in, the cloud copy of your collection (cars, photos, prices, history), and the backend functions | Free plan |
| **eBay Developers** | Current market prices for your cars, and the weekly value refreshes | Free |
| **Anthropic (Claude)** | Identifying a car from a photo, **only when you scan** | Pay as you go, about **$0.005 per scan** (100 cars ≈ $0.50, one time) |

Refreshing values never uses AI. Once your cars are scanned, keeping them valued is free.

---

## 1. Anthropic API key (car identification)

1. Go to <https://console.anthropic.com>, sign up, and add a small amount of credit under **Billing**. A few dollars covers
   hundreds of scans.
2. Under **API keys**, create a key and copy it (it starts with `sk-ant-`).

Scans use **Claude Haiku 4.5**, Anthropic's lowest-cost vision model. To cap spending, each account can do at most 40 scans
per day. You can change this with `DAILY_SCAN_LIMIT` in step 3.

## 2. eBay API keys (free market prices)

1. Go to <https://developer.ebay.com>, create a developer account, and open **Application Keys**.
2. Create a **Production** keyset. Copy the **App ID (Client ID)** and **Cert ID (Client Secret)**.
3. eBay will ask about *Marketplace Account Deletion* notifications before the production keys work. Diecast Collectors
   doesn't store any eBay user data, so choose the option to **apply for an exemption** and give that as the reason.

Prices are the median of current buy-it-now listings for the same car, with lots, customs and multipacks filtered out.
Treasure Hunts are only compared with other Treasure Hunts. Shipping isn't included.

## 3. Supabase (account, cloud copy, backend)

### 3a. Create the project
1. Go to <https://supabase.com>, sign up, and create a **new project** on the Free plan. Pick a region near you and save the
   database password somewhere safe.
2. Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.

### 3b. Create the tables
1. Open **SQL Editor → New query**.
2. Paste in the whole file `supabase/migrations/20260930000000_init.sql` and click **Run**.

This creates the `cars` table, the private `car-photos` storage bucket, and the security rules so that each account can only
read and write its own cars and photos.

### 3c. Turn on sign-in codes
The app signs you in with a 6-digit code sent by email. There are no passwords to forget, so you can always get back in
on a new phone.

1. Open **Authentication → Emails → Templates** (older dashboards: **Authentication → Email Templates**).
2. In both the **Magic Link** and the **Confirm signup** templates, add the code to the email body, for example:
   ```html
   <h2>Your Diecast Collectors code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
3. Supabase's built-in email sender is limited to a few emails per hour. That's fine for personal use. Before inviting other
   people, set up your own SMTP server under **Authentication → Emails → SMTP settings**.

### 3d. Deploy the backend functions
These commands need Node.js on your computer. Run them from the project folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF        # the ref is the part before .supabase.co in your URL
npx supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  EBAY_CLIENT_ID=your-ebay-app-id \
  EBAY_CLIENT_SECRET=your-ebay-cert-id
npx supabase functions deploy identify
npx supabase functions deploy valuate
npx supabase functions deploy delete-account
```

Optional: `npx supabase secrets set DAILY_SCAN_LIMIT=40` changes the per-account daily scan cap. With the CLI linked, you can
also use `npx supabase db push` instead of step 3b.

## 4. Run the app on your phone

1. In the `app/` folder, copy `.env.example` to `.env.local` and fill in the Supabase URL and key from step 3a.
2. Run:
   ```bash
   cd app
   npm install
   npx expo start
   ```
3. Install **Expo Go** from the App Store or Play Store and scan the QR code shown in the terminal. Every feature works in
   Expo Go.
4. To get a real, installable app: `npx eas-cli@latest build -p android` builds an APK for free. For iPhone you need an Apple
   Developer account to install outside Expo Go.

## How your data is protected

- **Every change is uploaded automatically**, a second or two after you make it: new cars, edits, my value, purchase price,
  value refreshes, deletions and photos. **Settings → Account & backup** shows "All changes saved to the cloud" when you're
  fully synced.
- **Offline is fine.** The phone keeps a full copy and uploads when you're back online.
- **New or lost phone:** install the app, sign in with the same email, and your whole collection downloads, photos included.
- **Two phones at once:** both stay in sync. If the same car is edited on both, the most recent edit wins.
- **Extra copy:** **Settings → Export collection** saves a JSON file you can keep anywhere, such as Google Drive or email.
  It's worth doing now and then, because Supabase's free plan doesn't include its own point-in-time backups.

## Free plan limits worth knowing

(Check Supabase's pricing page for current numbers.)

- **Storage:** photos are compressed to roughly 200–400 KB each, so 100 cars use about 20–40 MB of the free file storage.
- **Pausing:** Supabase pauses free projects that get no traffic for about a week. Your data is kept. Click **Restore** in
  the dashboard (or just use the app regularly).
- **eBay:** the Browse API allows thousands of calls per day for free. A value refresh uses 1–3 calls per car.
