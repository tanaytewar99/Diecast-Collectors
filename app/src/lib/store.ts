import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Car, CarDetails, CarStatus, IdentifyResponse, MarketValue } from './types';
import { appendMyValue, appendValuePoint, toMarketValue } from './value';

export interface Settings {
  currency: string;
  autoRefresh: boolean;
}

/** Local bookkeeping for cloud sync (see sync.ts). */
export interface SyncState {
  /** Account the local data belongs to. */
  userId: string | null;
  /** Cars changed locally and not yet uploaded. */
  dirty: string[];
  /** Cars deleted locally and not yet deleted in the cloud: id -> photo path to remove. */
  deleted: { id: string; photoPath: string | null }[];
  /** Server time of the newest change already downloaded. */
  lastPulledAt: string | null;
}

/** A scan waiting for the user to review and save. Kept in memory only. */
export interface Draft {
  photoUri: string | null;
  /** Base64 JPEG awaiting identification. */
  pendingImage: string | null;
  result: IdentifyResponse | null;
  details: CarDetails;
  description: string | null;
  status: CarStatus;
  myValue: number | null;
  purchasePrice: number | null;
}

export const emptyDetails = (): CarDetails => ({
  name: '',
  make: null,
  model: null,
  brand: null,
  series: null,
  year: null,
  scale: '1:64',
  color: null,
  castingNumber: null,
  packaging: 'unknown',
  condition: 'unknown',
  flags: [],
});

const emptySync = (userId: string | null = null): SyncState => ({ userId, dirty: [], deleted: [], lastPulledAt: null });

interface State {
  cars: Car[];
  settings: Settings;
  sync: SyncState;
  draft: Draft | null;
  hydrated: boolean;

  setDraft: (draft: Draft | null) => void;
  updateDraft: (patch: Partial<Draft>) => void;
  saveDraft: () => string | null;

  updateCar: (id: string, patch: Partial<Omit<Car, 'id'>>) => void;
  setMyValue: (id: string, value: number | null) => void;
  applyMarket: (id: string, market: MarketValue) => void;
  deleteCar: (id: string) => void;
  importCars: (cars: Car[]) => number;
  updateSettings: (patch: Partial<Settings>) => void;

  // Sync plumbing: these don't mark cars dirty.
  setSync: (patch: Partial<SyncState>) => void;
  setLocalFields: (id: string, patch: Pick<Partial<Car>, 'photoUri' | 'photoPath' | 'updatedAt'>) => void;
  replaceCars: (cars: Car[]) => void;
  /** Wipe local data (sign-out, switching accounts). */
  resetLocal: (userId: string | null) => void;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const addDirty = (sync: SyncState, ...ids: string[]): SyncState => ({ ...sync, dirty: [...new Set([...sync.dirty, ...ids])] });

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Change one car, bump its timestamp and queue it for upload. */
      const change = (id: string, fn: (c: Car) => Car) =>
        set((s) => ({
          cars: s.cars.map((c) => (c.id === id ? { ...fn(c), updatedAt: now() } : c)),
          sync: addDirty(s.sync, id),
        }));

      return {
        cars: [],
        settings: { currency: 'USD', autoRefresh: true },
        sync: emptySync(),
        draft: null,
        hydrated: false,

        setDraft: (draft) => set({ draft }),
        updateDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : s)),

        saveDraft: () => {
          const d = get().draft;
          if (!d || !d.details.name.trim()) return null;
          const at = now();
          const valuation = d.result?.valuation ?? null;
          const market = valuation ? toMarketValue(valuation, at) : null;
          const car: Car = {
            ...d.details,
            name: d.details.name.trim(),
            id: newId(),
            status: d.status,
            photoUri: d.photoUri,
            photoPath: null,
            createdAt: at,
            updatedAt: at,
            description: d.description,
            aiConfidence: d.result?.identification.confidence ?? null,
            currency: valuation?.currency ?? get().settings.currency,
            purchasePrice: d.purchasePrice,
            myValue: d.myValue,
            market,
            valueHistory: market ? appendValuePoint([], market) : [],
            myValueHistory: appendMyValue([], d.myValue, at),
            notes: null,
          };
          set((s) => ({ cars: [car, ...s.cars], draft: null, sync: addDirty(s.sync, car.id) }));
          return car.id;
        },

        updateCar: (id, patch) => change(id, (c) => ({ ...c, ...patch })),

        setMyValue: (id, value) =>
          change(id, (c) => ({ ...c, myValue: value, myValueHistory: appendMyValue(c.myValueHistory, value) })),

        applyMarket: (id, market) =>
          change(id, (c) => ({ ...c, market, valueHistory: appendValuePoint(c.valueHistory, market) })),

        deleteCar: (id) =>
          set((s) => {
            const car = s.cars.find((c) => c.id === id);
            return {
              cars: s.cars.filter((c) => c.id !== id),
              sync: {
                ...s.sync,
                dirty: s.sync.dirty.filter((d) => d !== id),
                deleted: [...s.sync.deleted.filter((d) => d.id !== id), { id, photoPath: car?.photoPath ?? null }],
              },
            };
          }),

        importCars: (incoming) => {
          const existing = new Set(get().cars.map((c) => c.id));
          const fresh = incoming
            .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && !existing.has(c.id))
            .map((c) => ({ ...c, photoPath: c.photoPath ?? null, updatedAt: now() }));
          set((s) => ({ cars: [...fresh, ...s.cars], sync: addDirty(s.sync, ...fresh.map((c) => c.id)) }));
          return fresh.length;
        },

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
        setLocalFields: (id, patch) => set((s) => ({ cars: s.cars.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
        replaceCars: (cars) => set({ cars }),
        resetLocal: (userId) => set({ cars: [], draft: null, sync: emptySync(userId) }),
      };
    },
    {
      name: 'diecast-collectors/v1',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ cars: s.cars, settings: s.settings, sync: s.sync }),
      // v1 (before cloud sync) had no photoPath/sync state.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { cars?: Car[]; settings?: Partial<Settings>; sync?: SyncState };
        if (version < 2) {
          return {
            cars: (p.cars ?? []).map((c) => ({ ...c, photoPath: c.photoPath ?? null })),
            settings: { currency: p.settings?.currency ?? 'USD', autoRefresh: p.settings?.autoRefresh ?? true },
            sync: emptySync(),
          };
        }
        return p;
      },
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);

export const useCar = (id: string | undefined) => useStore((s) => s.cars.find((c) => c.id === id));
