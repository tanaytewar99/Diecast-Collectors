import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { autoRefreshStale } from '../lib/refresh';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/supabase';
import { startSyncEngine } from '../lib/sync';
import { colors } from '../lib/theme';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.surface,
  },
};

export default function RootLayout() {
  const hydrated = useStore((s) => s.hydrated);
  const authReady = useAuth((s) => s.ready);
  const signedIn = useAuth((s) => !!s.session);
  const ready = hydrated && authReady;

  useEffect(() => {
    if (hydrated) startSyncEngine();
  }, [hydrated]);

  useEffect(() => {
    if (ready && signedIn) autoRefreshStale();
  }, [ready, signedIn]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        {ready ? (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="scan-result" options={{ title: 'Scan result', gestureEnabled: false }} />
              <Stack.Screen name="car/[id]" options={{ title: '' }} />
              <Stack.Screen name="car/edit" options={{ title: 'Edit details', presentation: 'modal' }} />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
