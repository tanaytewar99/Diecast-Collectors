import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { autoRefreshStale } from '../lib/refresh';
import { useStore } from '../lib/store';
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

  useEffect(() => {
    if (hydrated) autoRefreshStale();
  }, [hydrated]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        {hydrated ? (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="scan-result" options={{ title: 'Scan result', gestureEnabled: false }} />
            <Stack.Screen name="car/[id]" options={{ title: '' }} />
            <Stack.Screen name="car/edit" options={{ title: 'Edit details', presentation: 'modal' }} />
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
