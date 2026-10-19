import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Place, TravelMode } from '../lib/api';
import type { LatLng } from '../lib/geo';

export type MapTheme = 'auto' | 'day' | 'night';

export type Settings = {
  voice: boolean;
  mapTheme: MapTheme;
  buildings3d: boolean;
  defaultMode: TravelMode;
  keepAwake: boolean;
  showSpeed: boolean;
  cameraAlerts: boolean;
  /** km/h above the limit before warning, null = off. */
  overSpeedTolerance: number | null;
  /** Remember where the car was left when a car trip ends. */
  autoParking: boolean;
};

export type SavedPlace = Place & { label?: 'home' | 'work' };

export type Trip = {
  id: string;
  mode: TravelMode;
  to: Place;
  startedAt: number;
  endedAt: number;
  /** Meters actually covered according to route progress. */
  distance: number;
  arrived: boolean;
};

export type Parking = { coordinate: LatLng; savedAt: number; note?: string };

const DEFAULT_SETTINGS: Settings = {
  voice: true,
  mapTheme: 'auto',
  buildings3d: true,
  defaultMode: 'car',
  keepAwake: true,
  showSpeed: true,
  cameraAlerts: true,
  overSpeedTolerance: 10,
  autoParking: true,
};

const KEYS = {
  settings: 'nav.settings.v2',
  favorites: 'nav.favorites',
  recents: 'nav.recents',
  trips: 'nav.trips',
  parking: 'nav.parking',
};
const MAX_RECENTS = 15;
const MAX_TRIPS = 100;

type AppState = {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  favorites: SavedPlace[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (place: Place) => void;
  setLabeled: (label: 'home' | 'work', place: Place) => void;
  removeFavorite: (id: string) => void;
  recents: Place[];
  addRecent: (place: Place) => void;
  clearRecents: () => void;
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  clearTrips: () => void;
  parking: Parking | null;
  setParking: (p: Parking | null) => void;
  /** A place picked on another screen that the map should open. */
  pendingPlace: Place | null;
  openOnMap: (place: Place) => void;
  consumePendingPlace: () => Place | null;
};

const Ctx = createContext<AppState | null>(null);

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (fallback && typeof fallback === 'object') return { ...fallback, ...parsed };
    return parsed as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

/** useState that persists every change to AsyncStorage. */
function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const update = useCallback(
    (fn: (prev: T) => T) =>
      setValue((prev) => {
        const next = fn(prev);
        save(key, next);
        return next;
      }),
    [key],
  );
  return [value, setValue, update] as const;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings, updateSettingsWith] = usePersisted(KEYS.settings, DEFAULT_SETTINGS);
  const [favorites, setFavorites, updateFavorites] = usePersisted<SavedPlace[]>(KEYS.favorites, []);
  const [recents, setRecents, updateRecents] = usePersisted<Place[]>(KEYS.recents, []);
  const [trips, setTrips, updateTrips] = usePersisted<Trip[]>(KEYS.trips, []);
  const [parking, setParkingState, updateParking] = usePersisted<Parking | null>(KEYS.parking, null);
  const [pendingPlace, setPendingPlace] = useState<Place | null>(null);

  useEffect(() => {
    Promise.all([
      loadJson(KEYS.settings, DEFAULT_SETTINGS),
      loadJson<SavedPlace[]>(KEYS.favorites, []),
      loadJson<Place[]>(KEYS.recents, []),
      loadJson<Trip[]>(KEYS.trips, []),
      loadJson<Parking | null>(KEYS.parking, null),
    ]).then(([s, f, r, t, p]) => {
      setSettings(s);
      setFavorites(f);
      setRecents(r);
      setTrips(t);
      setParkingState(p);
      setReady(true);
    });
  }, [setSettings, setFavorites, setRecents, setTrips, setParkingState]);

  const updateSettings = useCallback((patch: Partial<Settings>) => updateSettingsWith((prev) => ({ ...prev, ...patch })), [updateSettingsWith]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      settings,
      updateSettings,
      favorites,
      isFavorite: (id) => favorites.some((p) => p.id === id),
      toggleFavorite: (place) =>
        updateFavorites((prev) => (prev.some((p) => p.id === place.id) ? prev.filter((p) => p.id !== place.id) : [place, ...prev])),
      setLabeled: (label, place) =>
        updateFavorites((prev) => [{ ...place, label }, ...prev.filter((p) => p.label !== label && p.id !== place.id)]),
      removeFavorite: (id) => updateFavorites((prev) => prev.filter((p) => p.id !== id)),
      recents,
      addRecent: (place) => updateRecents((prev) => [place, ...prev.filter((p) => p.id !== place.id)].slice(0, MAX_RECENTS)),
      clearRecents: () => updateRecents(() => []),
      trips,
      addTrip: (trip) => updateTrips((prev) => [trip, ...prev].slice(0, MAX_TRIPS)),
      clearTrips: () => updateTrips(() => []),
      parking,
      setParking: (p) => updateParking(() => p),
      pendingPlace,
      openOnMap: setPendingPlace,
      consumePendingPlace: () => {
        const p = pendingPlace;
        if (p) setPendingPlace(null);
        return p;
      },
    }),
    [ready, settings, updateSettings, favorites, updateFavorites, recents, updateRecents, trips, updateTrips, parking, updateParking, pendingPlace],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
