/**
 * Two-phone cloud sync test against an in-browser fake of Supabase.
 * Build first:  EXPO_PUBLIC_SUPABASE_URL=http://fake-supabase.local EXPO_PUBLIC_SUPABASE_ANON_KEY=anon-test npx expo export --platform web
 * Run:          NODE_PATH=$(npm root -g) node e2e/sync.e2e.cjs      (needs Playwright + Chromium)
 */
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');
const fake = require('./fake-supabase.cjs');
const out = (n) => path.join(__dirname, 'shots', n);
const DIST = path.join(__dirname, '..', 'dist');
const APP = 'http://localhost:8080/';
const waitFor = async (fn, label, ms = 20000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('timeout: ' + label);
};
const rowsOf = (email) => { const u = fake.db.users.get(email); return [...fake.db.rows.values()].filter((r) => r.user_id === u.id); };

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await fake.install(ctx);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  page.name = name;
  return page;
}

async function signIn(page, email, shot) {
  await page.goto(APP);
  await page.getByText('Email me a sign-in code').waitFor();
  if (shot) await page.screenshot({ path: out(shot) });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByText('Email me a sign-in code').click();
  await page.getByPlaceholder('123456').fill('000000');
  await page.getByText('Sign in', { exact: true }).click();
  await page.getByText('That code is wrong').waitFor();
  await page.getByPlaceholder('123456').fill('123456');
  await page.getByText('Sign in', { exact: true }).click();
  await page.getByText('Collection value').waitFor();
}

function serveDist() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.json': 'application/json' };
  return http
    .createServer((req, res) => {
      let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
      res.setHeader('content-type', types[path.extname(p)] ?? 'application/octet-stream');
      fs.createReadStream(p).pipe(res);
    })
    .listen(8080);
}

async function makeCarPhoto(browser) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(`<body style="margin:0;background:linear-gradient(#cfd8e3,#9aa7b5)"><svg width="800" height="600" viewBox="0 0 1024 768"><path fill="#1f5fbf" d="M168 520 C168 470 200 450 250 440 L380 420 L470 340 C500 316 530 306 570 306 L700 306 C740 306 770 322 792 350 L840 414 L870 420 C910 428 930 460 930 500 L930 540 L168 540 Z"/><circle cx="300" cy="545" r="62" fill="#222"/><circle cx="780" cy="545" r="62" fill="#222"/></svg></body>`);
  await page.screenshot({ path: path.join(__dirname, 'shots', 'car.jpg'), type: 'jpeg', quality: 85 });
  await page.close();
}

(async () => {
  fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
  const server = serveDist();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  await makeCarPhoto(browser);
  const EMAIL = 'tanay@example.com';

  // ---------------- Phone A: sign in, scan a car, set my value + purchase price
  const A = await phone(browser, 'A');
  await signIn(A, EMAIL, '20-sign-in.png');
  await A.getByText('Scan your first car').click();
  const [chooser] = await Promise.all([A.waitForEvent('filechooser'), A.getByText('Choose from photos').click()]);
  await chooser.setFiles(path.join(__dirname, 'shots', 'car.jpg'));
  await A.getByText('Add to Garage').waitFor({ timeout: 30000 });
  const inputs = A.locator('input[inputmode="decimal"]');
  await inputs.nth(0).fill('30');
  await inputs.nth(1).fill('12');
  await A.getByText('Add to Garage').click();
  await A.getByText('Details', { exact: true }).waitFor();

  await waitFor(() => rowsOf(EMAIL).length === 1 && fake.db.photos.size === 1, 'car + photo uploaded');
  let row = rowsOf(EMAIL)[0];
  assert.equal(row.data.myValue, 30);
  assert.equal(row.data.purchasePrice, 12);
  assert.equal(row.data.market.estimate, 18.5);
  assert.equal(row.data.valueHistory.length, 1);
  assert.equal(row.data.photoUri, null, 'device path not uploaded');
  assert.ok(row.data.photoPath.startsWith(fake.db.users.get(EMAIL).id + '/'));
  console.log('A: car, prices and photo reached the cloud');

  // Edit my value on A, then refresh market value (free eBay path).
  await A.getByText('My value', { exact: true }).nth(1).click();
  await A.locator('input[inputmode="decimal"]').fill('35');
  await A.getByText('Save', { exact: true }).click();
  await A.getByLabel('Refresh market value').click();
  await A.getByText('$21', { exact: true }).first().waitFor();
  await waitFor(() => rowsOf(EMAIL)[0].data.myValue === 35 && rowsOf(EMAIL)[0].data.market.estimate === 21, 'edits synced');
  console.log('A: my value edit + value refresh synced');

  // ---------------- Phone B: brand-new phone, same email -> everything is back
  const B = await phone(browser, 'B');
  await signIn(B, EMAIL);
  await B.getByText("'71 Datsun 510").first().waitFor({ timeout: 20000 });
  await B.waitForTimeout(1500);
  await B.screenshot({ path: out('21-new-phone-garage.png') });
  assert.ok(await B.getByText('$35').first().isVisible(), 'my value on new phone');
  assert.ok(await B.getByText('$12').first().isVisible(), 'invested on new phone');
  await B.getByText("'71 Datsun 510").first().click();
  await B.getByText('Details', { exact: true }).waitFor();
  await waitFor(async () => (await B.locator('img[src^="data:image/jpeg"]').count()) > 0, 'photo downloaded on B');
  await B.waitForTimeout(500);
  await B.screenshot({ path: out('22-new-phone-detail.png'), fullPage: true });
  assert.ok(await B.getByText('$21').first().isVisible(), 'market value on new phone');
  assert.ok(await B.getByText('Paid').first().isVisible());
  console.log('B: new phone got the car, photo, my value, purchase price and market value');

  // Delete on B -> gone on A too
  await B.getByLabel('Delete').click();
  await waitFor(() => rowsOf(EMAIL)[0].deleted === true, 'delete synced');
  assert.equal(fake.db.photos.size, 0, 'cloud photo removed');
  await A.reload();
  await A.getByText('This car is no longer in your garage.').waitFor({ timeout: 20000 });
  await A.goto(APP);
  await A.getByText('Start your garage').waitFor({ timeout: 20000 });
  console.log('A: deletion from B propagated');

  // ---------------- Upgrade path: data saved before accounts existed is uploaded on first sign-in
  const C = await phone(browser, 'C');
  await C.goto(APP);
  const legacy = [1, 2].map((i) => ({
    id: `legacy-${i}`, status: 'owned', photoUri: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    description: null, aiConfidence: 0.9, name: `Legacy Car ${i}`, make: null, model: null, brand: 'Matchbox', series: null, year: 2024,
    scale: '1:64', color: null, castingNumber: null, packaging: 'loose', condition: 'good', flags: [], currency: 'USD',
    purchasePrice: 2, myValue: 5, market: null, valueHistory: [], myValueHistory: [{ date: '2026-08-01T00:00:00.000Z', value: 5 }], notes: 'from v1',
  }));
  await C.evaluate((cars) => localStorage.setItem('diecast-collectors/v1', JSON.stringify({ state: { cars, settings: { currency: 'USD', autoRefresh: false, apiUrl: 'x', appKey: '' } }, version: 0 })), legacy);
  await signIn(C, 'second@example.com');
  await waitFor(() => rowsOf('second@example.com').length === 2, 'legacy cars uploaded');
  assert.equal(rowsOf('second@example.com')[0].data.notes, 'from v1');
  assert.equal(rowsOf(EMAIL).length, 1, 'accounts are separate');
  await C.getByText('Legacy Car 1').first().waitFor();
  console.log('C: pre-account local data adopted and uploaded; accounts isolated');

  // ---------------- Sign out on C: local data cleared, cloud copy kept, sign back in restores it
  await C.getByText('Settings', { exact: true }).last().click();
  await C.getByText('All changes saved to the cloud').first().waitFor();
  await C.screenshot({ path: out('23-settings-account.png'), fullPage: true });
  await C.getByText('Sign out', { exact: true }).click();
  await C.getByText('Email me a sign-in code').waitFor();
  const stored = await C.evaluate(() => JSON.parse(localStorage.getItem('diecast-collectors/v1')).state.cars.length);
  assert.equal(stored, 0);
  await signIn(C, 'second@example.com');
  await C.getByText('Legacy Car 2').first().waitFor();
  console.log('C: sign out cleared phone, sign in restored from cloud');

  // Currency preference follows the account to a new phone.
  await C.getByText('Settings', { exact: true }).last().click();
  await C.getByText('EUR', { exact: true }).click();
  await waitFor(() => fake.db.users.get('second@example.com').meta?.currency === 'EUR', 'currency saved to account');
  const D = await phone(browser, 'D');
  await signIn(D, 'second@example.com');
  await D.getByText('Legacy Car 1').first().waitFor();
  await waitFor(async () => (await D.evaluate(() => JSON.parse(localStorage.getItem('diecast-collectors/v1')).state.settings.currency)) === 'EUR', 'currency on new phone');
  console.log('D: currency preference restored on new phone');

  assert.equal(fake.db.identifyCalls, 1, 'AI used once (the scan)');
  console.log('AI calls:', fake.db.identifyCalls, 'free eBay valuations:', fake.db.valuateCalls);
  for (const p of [A, B, C, D]) if (p.errors.length) console.log(p.name, 'ERRORS', p.errors);
  await browser.close();
  server.close();
  console.log('ALL SYNC CHECKS PASSED');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
