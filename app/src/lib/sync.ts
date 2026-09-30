/**
 * Cloud sync: the phone keeps a full local copy (works offline); every change is uploaded to Supabase,
 * and changes from other devices are pulled down. Conflicts: the most recent edit wins.
 */
import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { deletePhoto, readPhotoBytes, savePhotoFromUrl } from './photos';
import { useStore } from './store';
import { currentUserId, PHOTO_BUCKET, supabase, supabaseConfigured, useAuth } from './supabase';
import type { Car } from './types';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error';
  lastSyncedAt: string | null;
  error: string | null;
}

export const useSyncStatus = create<SyncStatus>(() => ({ state: 'idle', lastSyncedAt: null, error: null }));

interface RemoteRow {
  id: string;
  data: Car;
  deleted: boolean;
  client_updated_at: string;
  synced_at: string;
}

const PAGE = 500;
const time = (iso: string) => new Date(iso).getTime();
const toCloud = (car: Car): Car => ({ ...car, photoUri: null });

let running: Promise<void> | null = null;
let again = false;

/** Run a sync now (or join the one in progress, then run once more). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce() {
  const uid = currentUserId();
  if (!uid || !supabaseConfigured || useStore.getState().sync.userId !== uid) return;
  useSyncStatus.setState({ state: 'syncing', error: null });
  try {
    const skipped = await uploadPhotos(uid);
    await pushCars(uid, skipped);
    await pushDeletes(uid);
    await pull();
    await downloadMissingPhotos();
    useSyncStatus.setState({ state: 'idle', lastSyncedAt: new Date().toISOString(), error: null });
  } catch (err) {
    console.warn('sync failed', err);
    useSyncStatus.setState({
      state: 'error',
      error: 'Could not reach the cloud. Your changes are saved on this phone and will upload automatically.',
    });
  }
}

/** Upload photos of changed cars. Returns ids whose photo must upload before the car can be pushed. */
async function uploadPhotos(uid: string): Promise<Set<string>> {
  const skipped = new Set<string>();
  const { cars, sync, setLocalFields } = useStore.getState();
  const pending = cars.filter((c) => sync.dirty.includes(c.id) && c.photoUri && !c.photoPath);
  for (const car of pending) {
    let bytes: Uint8Array;
    try {
      bytes = await readPhotoBytes(car.photoUri!);
    } catch {
      continue; // Local file is gone; sync the car without a photo rather than block it forever.
    }
    const path = `${uid}/${car.id}.jpg`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      skipped.add(car.id);
      continue;
    }
    setLocalFields(car.id, { photoPath: path, updatedAt: new Date().toISOString() });
  }
  return skipped;
}

async function pushCars(uid: string, skipped: Set<string>) {
  const { cars, sync } = useStore.getState();
  const byId = new Map(cars.map((c) => [c.id, c]));
  const batch = sync.dirty.map((id) => byId.get(id)).filter((c): c is Car => !!c && !skipped.has(c.id));
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    const { error } = await supabase.from('cars').upsert(
      chunk.map((c) => ({ user_id: uid, id: c.id, data: toCloud(c), deleted: false, client_updated_at: c.updatedAt })),
      { onConflict: 'user_id,id' },
    );
    if (error) throw error;
    // Clear only cars not edited again while uploading.
    const sent = new Map(chunk.map((c) => [c.id, c.updatedAt]));
    useStore.setState((s) => {
      const current = new Map(s.cars.map((c) => [c.id, c.updatedAt]));
      return {
        sync: {
          ...s.sync,
          dirty: s.sync.dirty.filter((id) => current.has(id) && !(sent.has(id) && sent.get(id) === current.get(id))),
        },
      };
    });
  }
}

async function pushDeletes(uid: string) {
  const { deleted } = useStore.getState().sync;
  if (!deleted.length) return;
  const at = new Date().toISOString();
  const { error } = await supabase
    .from('cars')
    .upsert(
      deleted.map((d) => ({ user_id: uid, id: d.id, data: {}, deleted: true, client_updated_at: at })),
      { onConflict: 'user_id,id' },
    );
  if (error) throw error;
  const paths = deleted.map((d) => d.photoPath).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths); // best effort
  const done = new Set(deleted.map((d) => d.id));
  useStore.setState((s) => ({ sync: { ...s.sync, deleted: s.sync.deleted.filter((d) => !done.has(d.id)) } }));
}

async function pull() {
  const { lastPulledAt } = useStore.getState().sync;
  // Small overlap so a slow concurrent write is never skipped; applying a row twice is harmless.
  const since = lastPulledAt ? new Date(time(lastPulledAt) - 5 * 60_000).toISOString() : null;
  const rows: RemoteRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('cars').select('id, data, deleted, client_updated_at, synced_at').order('synced_at').range(from, from + PAGE - 1);
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as RemoteRow[]));
    if (!data || data.length < PAGE) break;
  }
  if (rows.length) applyRemote(rows);
}

/** Merge downloaded rows into the current local state in one synchronous update. */
export function applyRemote(rows: RemoteRow[]) {
  const removedPhotos: (string | null)[] = [];
  useStore.setState((s) => {
    const cars = new Map(s.cars.map((c) => [c.id, c]));
    const dirty = new Set(s.sync.dirty);
    const pendingDelete = new Set(s.sync.deleted.map((d) => d.id));
    let newest = s.sync.lastPulledAt;
    for (const row of rows) {
      if (!newest || time(row.synced_at) > time(newest)) newest = row.synced_at;
      const local = cars.get(row.id);
      if (pendingDelete.has(row.id)) continue;
      if (row.deleted) {
        if (local && !dirty.has(row.id)) {
          removedPhotos.push(local.photoUri);
          cars.delete(row.id);
        }
        continue;
      }
      if (local && time(local.updatedAt) >= time(row.client_updated_at)) continue;
      const keepPhoto = local && local.photoPath === row.data.photoPath ? local.photoUri : null;
      if (local && !keepPhoto) removedPhotos.push(local.photoUri);
      cars.set(row.id, { ...row.data, photoUri: keepPhoto, updatedAt: row.client_updated_at });
      dirty.delete(row.id);
    }
    return { cars: [...cars.values()], sync: { ...s.sync, dirty: [...dirty], lastPulledAt: newest } };
  });
  removedPhotos.forEach((uri) => deletePhoto(uri));
}

async function downloadMissingPhotos() {
  const missing = useStore.getState().cars.filter((c) => c.photoPath && !c.photoUri);
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (car) => {
        try {
          const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(car.photoPath!, 600);
          if (error || !data) return;
          const uri = await savePhotoFromUrl(data.signedUrl, car.id);
          useStore.getState().setLocalFields(car.id, { photoUri: uri });
        } catch {
          // Try again next sync.
        }
      }),
    );
  }
}

/**
 * Called when the signed-in account changes. Local cars made before signing in are adopted by the
 * account and uploaded; data from a different account is replaced by this account's cloud copy.
 */
export async function adoptAccount(uid: string) {
  const { sync, cars, setSync, resetLocal } = useStore.getState();
  if (sync.userId === uid) {
    // same account
  } else if (sync.userId === null) {
    setSync({ userId: uid, dirty: cars.map((c) => c.id), deleted: [], lastPulledAt: null });
  } else {
    cars.forEach((c) => deletePhoto(c.photoUri));
    resetLocal(uid);
  }
  await syncNow();
}

export function pendingChanges(): number {
  const { dirty, deleted } = useStore.getState().sync;
  return dirty.length + deleted.length;
}

/** Sign out and remove this account's data from the phone (it stays in the cloud). */
export async function signOutAndClear() {
  const { cars, resetLocal } = useStore.getState();
  await supabase.auth.signOut();
  cars.forEach((c) => deletePhoto(c.photoUri));
  resetLocal(null);
  useSyncStatus.setState({ state: 'idle', lastSyncedAt: null, error: null });
}

let started = false;

/** Keep the cloud copy up to date: after sign-in, after local changes, and when the app returns to the foreground. */
export function startSyncEngine() {
  if (started) return;
  started = true;

  let lastUid: string | null = null;
  const onAuth = (session: Session | null) => {
    const uid = session?.user.id ?? null;
    if (session && uid !== lastUid) {
      // Preferences travel with the account too.
      const currency = session.user.user_metadata?.currency;
      if (typeof currency === 'string') useStore.getState().updateSettings({ currency });
      void adoptAccount(session.user.id);
    }
    lastUid = uid;
  };
  onAuth(useAuth.getState().session);
  useAuth.subscribe((s) => onAuth(s.session));

  let timer: ReturnType<typeof setTimeout> | null = null;
  useStore.subscribe((s, prev) => {
    if (s.sync.dirty === prev.sync.dirty && s.sync.deleted === prev.sync.deleted) return;
    if (!s.sync.dirty.length && !s.sync.deleted.length) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1500);
  });

  let lastForeground = 0;
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - lastForeground > 30_000) {
      lastForeground = Date.now();
      void syncNow();
    }
  });
}

/** Remember a preference on the account so a new phone picks it up. */
export function saveAccountPreference(prefs: { currency: string }) {
  void supabase.auth.updateUser({ data: prefs }).catch(() => {});
}
