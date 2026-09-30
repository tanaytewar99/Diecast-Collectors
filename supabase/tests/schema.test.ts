import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
// Runs the real migration against Postgres (PGlite) with minimal stand-ins for Supabase's auth/storage schemas.
Deno.test('schema: row-level security, sync stamps, scan budget, cascade delete', async () => {
const db = new PGlite();
// Minimal stand-ins for Supabase's built-in schemas/roles.
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id serial primary key, bucket_id text, name text); alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  grant usage on schema public, auth, storage to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, anon;
  grant all on storage.objects to authenticated; grant usage on sequence storage.objects_id_seq to authenticated;
`);
const sql = await Deno.readTextFile(new URL('../migrations/20260930000000_init.sql', import.meta.url));
await db.exec(sql);
await db.exec(sql); // idempotent re-run
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const as = async (uid: string, q: string, params?: unknown[]) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  return db.query<Row>(q, params);
};
await as(A, `insert into public.cars (id, data, client_updated_at) values ('c1', '{"name":"A car"}', '2026-01-02')`);
await as(B, `insert into public.cars (id, data, client_updated_at) values ('c1', '{"name":"B car"}', '2026-01-02')`);
assert.equal((await as(A, 'select * from public.cars')).rows.length, 1, 'A sees only own');
assert.equal((await as(A, 'select data from public.cars')).rows[0].data.name, 'A car');
// cannot write rows for someone else
await assert.rejects(as(A, `insert into public.cars (user_id, id, data, client_updated_at) values ('${B}', 'x', '{}', now())`));
// upsert newer wins, older ignored
const up = `insert into public.cars (user_id, id, data, client_updated_at) values ($1, 'c1', $2, $3)
            on conflict (user_id, id) do update set data = excluded.data, client_updated_at = excluded.client_updated_at`;
const before = (await as(A, 'select synced_at from public.cars')).rows[0].synced_at;
await as(A, up, [A, { name: 'newer' }, '2026-01-03']);
await as(A, up, [A, { name: 'stale' }, '2026-01-01']);
const row = (await as(A, 'select data, synced_at from public.cars')).rows[0];
assert.equal(row.data.name, 'newer');
assert.ok(row.synced_at > before, 'synced_at bumps');
// B's row untouched
assert.equal((await as(B, 'select data from public.cars')).rows[0].data.name, 'B car');
// scan budget
const results = [];
for (let i = 0; i < 3; i++) results.push((await as(A, 'select public.consume_scan(2) as ok')).rows[0].ok);
assert.deepEqual(results, [true, true, false]);
assert.equal((await as(A, 'select * from public.scan_usage')).rows.length, 0, 'usage hidden');
await as(A, `update public.scan_usage set count = 0`);
await db.exec('reset role');
assert.equal((await db.query<Row>('select count from public.scan_usage')).rows[0].count, 3, 'user cannot reset usage');
await assert.rejects(as(A, `insert into public.scan_usage values ('${A}', current_date + 1, 0)`));
// storage policies
await as(A, `insert into storage.objects (bucket_id, name) values ('car-photos', '${A}/c1.jpg')`);
await assert.rejects(as(A, `insert into storage.objects (bucket_id, name) values ('car-photos', '${B}/c1.jpg')`));
assert.equal((await as(B, `select * from storage.objects`)).rows.length, 0);
// account deletion cascades
await db.exec(`reset role; delete from auth.users where id = '${A}'`);
assert.equal((await db.query<Row>(`select count(*)::int as n from public.cars where user_id = '${A}'`)).rows[0].n, 0);
await db.close();
});
