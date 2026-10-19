import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { usePalette } from '../lib/theme';
import { TripProvider } from '../positioning/TripProvider';
import { AppStateProvider } from '../state/AppState';
import { ThemeProvider } from '../state/ThemeProvider';

const modal = { presentation: 'modal' as const };

function ThemedStack() {
  const c = usePalette();
  const navTheme = useMemo(() => {
    const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.surfaceSolid, text: c.text, border: c.stroke },
    };
  }, [c]);
  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="favorites" options={{ ...modal, title: 'Избранное' }} />
        <Stack.Screen name="settings" options={{ ...modal, title: 'Настройки' }} />
        <Stack.Screen name="offline" options={{ title: 'Офлайн-карты' }} />
        <Stack.Screen name="history" options={{ title: 'Поездки' }} />
        <Stack.Screen name="voices" options={{ title: 'Голос' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppStateProvider>
      <TripProvider>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </TripProvider>
    </AppStateProvider>
  );
}
