import { createContext, useContext, useMemo } from 'react';

export type Palette = {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceSolid: string;
  surfaceRaised: string;
  surfacePressed: string;
  stroke: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Text/icons on accent, danger and colored backgrounds. */
  onAccent: string;
  accent: string;
  accentDim: string;
  route: string;
  routeCasing: string;
  routeAlt: string;
  routePassed: string;
  maneuver: string;
  maneuverLight: string;
  green: string;
  red: string;
  orange: string;
  yellow: string;
  dr: string;
  /** expo-blur tint and the translucent layer over it. */
  glassTint: 'light' | 'dark';
  glassOverlay: string;
  grabber: string;
  shadow: string;
};

export const darkPalette: Palette = {
  scheme: 'dark',
  bg: '#0B0D11',
  surface: 'rgba(22,25,31,0.92)',
  surfaceSolid: '#16191F',
  surfaceRaised: '#20242C',
  surfacePressed: '#2A2F38',
  stroke: 'rgba(255,255,255,0.08)',
  text: '#F4F6FA',
  textSecondary: '#9AA1AE',
  textTertiary: '#646B78',
  onAccent: '#FFFFFF',
  accent: '#3D8BFF',
  accentDim: 'rgba(61,139,255,0.16)',
  route: '#3D8BFF',
  routeCasing: '#1C4F9C',
  routeAlt: '#5C6574',
  routePassed: '#596273',
  maneuver: '#123B2A',
  maneuverLight: '#1B5A3F',
  green: '#34C77B',
  red: '#FF5A4E',
  orange: '#FF9F2E',
  yellow: '#FFD23F',
  dr: '#8E96A3',
  glassTint: 'dark',
  glassOverlay: 'rgba(16,19,24,0.72)',
  grabber: 'rgba(255,255,255,0.18)',
  shadow: '#000000',
};

export const lightPalette: Palette = {
  scheme: 'light',
  bg: '#F2F2F7',
  surface: 'rgba(255,255,255,0.94)',
  surfaceSolid: '#FFFFFF',
  surfaceRaised: '#EEEEF3',
  surfacePressed: '#E2E2E8',
  stroke: 'rgba(0,0,0,0.09)',
  text: '#101318',
  textSecondary: '#5D6470',
  textTertiary: '#989EA9',
  onAccent: '#FFFFFF',
  accent: '#0A72F0',
  accentDim: 'rgba(10,114,240,0.11)',
  route: '#2F7BF5',
  routeCasing: '#1A56B8',
  routeAlt: '#9EA7B5',
  routePassed: '#A3ABB8',
  maneuver: '#155E3D',
  maneuverLight: '#1D7A51',
  green: '#1FA463',
  red: '#E5392E',
  orange: '#E8890C',
  yellow: '#E0A800',
  dr: '#8A93A0',
  glassTint: 'light',
  glassOverlay: 'rgba(255,255,255,0.74)',
  grabber: 'rgba(0,0,0,0.16)',
  shadow: '#1B2433',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };

export const font = {
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  sub: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 },
  number: { fontVariant: ['tabular-nums' as const] },
};

export const ThemeContext = createContext<Palette>(darkPalette);

export function usePalette(): Palette {
  return useContext(ThemeContext);
}

/**
 * Palette plus styles built from it. `make` must be a module-level function so
 * styles are rebuilt only when the theme changes.
 */
export function useThemed<T>(make: (c: Palette) => T): { colors: Palette; s: T } {
  const colors = useContext(ThemeContext);
  const s = useMemo(() => make(colors), [make, colors]);
  return { colors, s };
}
