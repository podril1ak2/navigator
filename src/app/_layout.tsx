import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';
import { TripProvider } from '../positioning/TripProvider';
import { AppStateProvider } from '../state/AppState';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.accent, background: colors.bg, card: colors.surfaceSolid, border: colors.stroke },
};

const modal = { presentation: 'modal' as const, headerLargeTitle: false };

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <AppStateProvider>
        <TripProvider>
          <StatusBar style="light" />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="favorites" options={{ ...modal, title: 'Избранное' }} />
            <Stack.Screen name="settings" options={{ ...modal, title: 'Настройки' }} />
            <Stack.Screen name="offline" options={{ title: 'Офлайн-карты' }} />
            <Stack.Screen name="history" options={{ title: 'Поездки' }} />
          </Stack>
        </TripProvider>
      </AppStateProvider>
    </ThemeProvider>
  );
}
