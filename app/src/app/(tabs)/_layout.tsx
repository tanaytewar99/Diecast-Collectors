import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../lib/theme';

function ScanButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scan a car"
      onPress={() => router.push('/scan')}
      style={({ pressed }) => [styles.scan, pressed && { backgroundColor: colors.primaryPressed }]}
    >
      <Ionicons name="scan" size={28} color={colors.text} />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.surface, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Garage', tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="scan-tab"
        options={{
          title: '',
          tabBarButton: () => (
            <View style={styles.scanWrap}>
              <ScanButton />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Insights', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings-sharp" size={size} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanWrap: { flex: 1, alignItems: 'center' },
  scan: {
    marginTop: -22,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
