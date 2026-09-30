// In-browser fake of the Supabase APIs the app uses (auth OTP, cars table, photo storage, edge functions).
const BASE = 'http://fake-supabase.local';
const db = { users: new Map(), rows: new Map(), photos: new Map(), otps: [], seq: 0, identifyCalls: 0, valuateCalls: 0 };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const userFromReq = (req) => {
  const tok = (req.headers()['authorization'] || '').replace('Bearer ', '');
  try {
    const { sub } = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
    for (const u of db.users.values()) if (u.id === sub) return u;
  } catch {}
  return null;
};
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const send = (route, status, body, headers = {}) =>
  route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...headers }, body: body === undefined ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
const userJson = (u) => ({ id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: u.meta ?? {}, created_at: '2026-09-01T00:00:00Z' });
const nextStamp = () => new Date(Date.now() + ++db.seq).toISOString();

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const method = req.method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

  // ---- auth
  if (p === '/auth/v1/otp') {
    const { email } = req.postDataJSON();
    if (!db.users.has(email)) db.users.set(email, { id: `00000000-0000-4000-8000-${String(db.users.size + 1).padStart(12, '0')}`, email });
    db.otps.push(email);
    return send(route, 200, {});
  }
  if (p === '/auth/v1/verify') {
    const { email, token } = req.postDataJSON();
    if (token !== '123456') return send(route, 403, { code: 'otp_expired', msg: 'Token has expired or is invalid', error_code: 'otp_expired' });
    const u = db.users.get(email);
    return send(route, 200, { access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-' + u.id, user: userJson(u) });
  }
  if (p === '/auth/v1/user' && method === 'PUT') {
    const u = userFromReq(req);
    if (!u) return send(route, 401, { msg: 'invalid' });
    u.meta = { ...(u.meta ?? {}), ...(req.postDataJSON().data ?? {}) };
    return send(route, 200, userJson(u));
  }
  if (p === '/auth/v1/user') {
    const u = userFromReq(req);
    return u ? send(route, 200, userJson(u)) : send(route, 401, { msg: 'invalid' });
  }
  if (p === '/auth/v1/logout') return send(route, 204);

  const user = userFromReq(req);
  if (!user) return send(route, 401, { message: 'unauthorized' });

  // ---- cars table (RLS: own rows only; server trigger semantics)
  if (p === '/rest/v1/cars') {
    if (method === 'POST') {
      for (const r of req.postDataJSON()) {
        if (r.user_id !== user.id) return send(route, 403, { message: 'RLS violation' });
        const key = `${user.id}/${r.id}`;
        const old = db.rows.get(key);
        if (old && new Date(r.client_updated_at) < new Date(old.client_updated_at)) continue;
        db.rows.set(key, { ...r, synced_at: nextStamp() });
      }
      return send(route, 201, '');
    }
    if (method === 'GET') {
      let rows = [...db.rows.values()].filter((r) => r.user_id === user.id);
      const gt = url.searchParams.get('synced_at');
      if (gt) rows = rows.filter((r) => r.synced_at > gt.replace('gt.', ''));
      rows.sort((a, b) => a.synced_at.localeCompare(b.synced_at));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      return send(route, 200, rows.slice(offset, offset + limit).map(({ id, data, deleted, client_updated_at, synced_at }) => ({ id, data, deleted, client_updated_at, synced_at })));
    }
  }

  // ---- storage
  const obj = p.match(/^\/storage\/v1\/object\/car-photos\/(.+)$/);
  if (obj && method === 'POST') {
    const path = decodeURIComponent(obj[1]);
    if (!path.startsWith(user.id + '/')) return send(route, 403, { message: 'RLS' });
    db.photos.set(path, req.postDataBuffer());
    return send(route, 200, { Key: `car-photos/${path}` });
  }
  const sign = p.match(/^\/storage\/v1\/object\/sign\/car-photos\/(.+)$/);
  if (sign && method === 'POST') {
    const path = decodeURIComponent(sign[1]);
    if (!path.startsWith(user.id + '/') || !db.photos.has(path)) return send(route, 404, { message: 'not found' });
    return send(route, 200, { signedURL: `/object/sign/car-photos/${path}?token=fake-${Date.now()}` });
  }
  if (p === '/storage/v1/object/car-photos' && method === 'DELETE') {
    for (const path of req.postDataJSON().prefixes) if (path.startsWith(user.id + '/')) db.photos.delete(path);
    return send(route, 200, []);
  }

  // ---- edge functions
  if (p === '/functions/v1/identify') {
    db.identifyCalls++;
    return send(route, 200, {
      identification: {
        isDiecast: true,
        car: { name: "'71 Datsun 510", make: 'Datsun', model: '510', brand: 'Hot Wheels', series: 'Car Culture: Japan Historics 3', year: 2020, scale: '1:64', color: 'Blue', castingNumber: 'GJP77', packaging: 'carded', condition: 'mint', flags: ['Real Riders'] },
        description: 'Premium Car Culture release with Real Riders rubber tires.', confidence: 0.88, evidence: 'Card', alternatives: [],
      },
      valuation: { estimate: 18.5, low: 14, high: 24, confidence: 'medium', rationale: 'Median of 7 current eBay listings for this car (buy-it-now prices, shipping not included).', sources: [{ title: 'Hot Wheels 71 Datsun 510', url: 'https://www.ebay.com/itm/1' }], currency: 'USD', listingsCount: 7 },
      valuationError: null,
    });
  }
  if (p === '/functions/v1/valuate') {
    db.valuateCalls++;
    return send(route, 200, { valuation: { estimate: 21, low: 16, high: 26, confidence: 'medium', rationale: 'Median of 8 current eBay listings.', sources: [], currency: 'USD', listingsCount: 8 } });
  }
  return send(route, 404, { message: `fake: no route for ${method} ${p}` });
}

async function install(context) {
  await context.route(`${BASE}/**`, async (route) => {
    const p = new URL(route.request().url()).pathname;
    const pub = route.request().method() === 'GET' && p.match(/^\/storage\/v1\/object\/sign\/car-photos\/(.+)$/);
    if (pub) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/jpeg' }, body: db.photos.get(decodeURIComponent(pub[1])) });
    return handle(route);
  });
}
module.exports = { install, db };
