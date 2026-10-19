import type { ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import { isDaytime } from '../lib/sun';
import { darkPalette, lightPalette, ThemeContext } from '../lib/theme';
import { useTrip } from '../positioning/TripProvider';
import { useAppState } from './AppState';

const MOSCOW = { latitude: 55.7558, longitude: 37.6173 };

/** True when the day palette should be used (setting, or sun position in "auto"). */
export function useIsDay(): boolean {
  const { settings } = useAppState();
  const { controller, initialCenter } = useTrip();
  const minute = useNow(60000);
  if (settings.mapTheme !== 'auto') return settings.mapTheme === 'day';
  const at = controller.getSnapshot().position?.coordinate ?? initialCenter ?? MOSCOW;
  return isDaytime(at, new Date(minute));
}

/** Applies the same day/night choice to the whole UI as to the map. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const day = useIsDay();
  return <ThemeContext.Provider value={day ? lightPalette : darkPalette}>{children}</ThemeContext.Provider>;
}
