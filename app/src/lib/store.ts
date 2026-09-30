import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Car, CarDetails, CarStatus, IdentifyResponse, MarketValue } from './types';
import { appendMyValue, appendValuePoint, toMarketValue } from './value';

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export interface Settings {
  currency: string;
  autoRefresh: boolean;
  apiUrl: string;
  appKey: string;
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

interface State {
  cars: Car[];
  settings: Settings;
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
  clearAll: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      cars: [],
      settings: { currency: 'USD', autoRefresh: true, apiUrl: DEFAULT_API_URL, appKey: '' },
      draft: null,
      hydrated: false,

      setDraft: (draft) => set({ draft }),
      updateDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : s)),

      saveDraft: () => {
        const d = get().draft;
        if (!d || !d.details.name.trim()) return null;
        const now = new Date().toISOString();
        const valuation = d.result?.valuation ?? null;
        const market = valuation ? toMarketValue(valuation, now) : null;
        const car: Car = {
          ...d.details,
          name: d.details.name.trim(),
          id: newId(),
          status: d.status,
          photoUri: d.photoUri,
          createdAt: now,
          updatedAt: now,
          description: d.description,
          aiConfidence: d.result?.identification.confidence ?? null,
          currency: get().settings.currency,
          purchasePrice: d.purchasePrice,
          myValue: d.myValue,
          market,
          valueHistory: market ? appendValuePoint([], market) : [],
          myValueHistory: appendMyValue([], d.myValue, now),
          notes: null,
        };
        set((s) => ({ cars: [car, ...s.cars], draft: null }));
        return car.id;
      },

      updateCar: (id, patch) =>
        set((s) => ({
          cars: s.cars.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)),
        })),

      setMyValue: (id, value) =>
        set((s) => ({
          cars: s.cars.map((c) =>
            c.id === id
              ? {
                  ...c,
                  myValue: value,
                  myValueHistory: appendMyValue(c.myValueHistory, value),
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        })),

      applyMarket: (id, market) =>
        set((s) => ({
          cars: s.cars.map((c) =>
            c.id === id ? { ...c, market, valueHistory: appendValuePoint(c.valueHistory, market) } : c,
          ),
        })),

      deleteCar: (id) => set((s) => ({ cars: s.cars.filter((c) => c.id !== id) })),

      importCars: (incoming) => {
        const existing = new Set(get().cars.map((c) => c.id));
        const fresh = incoming.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && !existing.has(c.id));
        set((s) => ({ cars: [...fresh, ...s.cars] }));
        return fresh.length;
      },

      clearAll: () => set({ cars: [], draft: null }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'diecast-collectors/v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ cars: s.cars, settings: s.settings }),
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);

export const useCar = (id: string | undefined) => useStore((s) => s.cars.find((c) => c.id === id));
