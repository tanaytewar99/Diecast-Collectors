-- Diecast Collectors: cloud copy of each user's collection.
-- Every car (details, prices, value history, purchase price, notes) is stored as one JSON document,
-- so nothing the app tracks is lost when you switch phones.

create table if not exists public.cars (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  -- When the phone last changed this car. Used for last-writer-wins between devices.
  client_updated_at timestamptz not null,
  -- When the server accepted the change. Phones pull everything newer than their last sync.
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists cars_user_synced_idx on public.cars (user_id, synced_at);

-- Stamp every write, and ignore writes older than what the server already has
-- (e.g. a phone that was offline for a week pushing stale edits).
create or replace function public.cars_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists cars_before_write on public.cars;
create trigger cars_before_write
  before insert or update on public.cars
  for each row execute function public.cars_before_write();

alter table public.cars enable row level security;

drop policy if exists "cars: read own" on public.cars;
create policy "cars: read own" on public.cars
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "cars: insert own" on public.cars;
create policy "cars: insert own" on public.cars
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "cars: update own" on public.cars;
create policy "cars: update own" on public.cars
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "cars: delete own" on public.cars;
create policy "cars: delete own" on public.cars
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- AI scan budget: caps scans per user per day so the (small) AI bill can't run away.

create table if not exists public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.scan_usage enable row level security;
-- No policies: only reachable through consume_scan() below.

create or replace function public.consume_scan(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    return false;
  end if;
  insert into public.scan_usage (user_id, day, count)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.scan_usage.count + 1
  returning count into used;
  return used <= p_limit;
end;
$$;

revoke all on function public.consume_scan(integer) from public, anon;
grant execute on function public.consume_scan(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Photos: private bucket, one folder per user ("<user id>/<car id>.jpg").

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-photos', 'car-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "car-photos: read own" on storage.objects;
create policy "car-photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "car-photos: insert own" on storage.objects;
create policy "car-photos: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "car-photos: update own" on storage.objects;
create policy "car-photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "car-photos: delete own" on storage.objects;
create policy "car-photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
