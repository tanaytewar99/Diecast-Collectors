import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '../lib/format';
import { colors, radius, space } from '../lib/theme';
import type { Car } from '../lib/types';
import { effectiveValue, gain } from '../lib/value';

export function CarPhoto({ uri, style }: { uri: string | null; style?: object }) {
  if (!uri) {
    return (
      <View style={[styles.placeholder, style]}>
        <Ionicons name="car-sport" size={40} color={colors.border} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit="cover" transition={150} />;
}

export function CarCard({ car }: { car: Car }) {
  const g = gain(car);
  const value = effectiveValue(car);
  const special = car.flags.find((f) => /treasure|chase|limited/i.test(f));
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() => router.push(`/car/${car.id}`)}
      accessibilityLabel={`${car.name}, ${formatMoney(value, car.currency)}`}
    >
      <View>
        <CarPhoto uri={car.photoUri} style={styles.photo} />
        {car.status === 'wishlist' && (
          <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="heart" size={11} color={colors.primary} />
            <Text style={styles.badgeText}>Wishlist</Text>
          </View>
        )}
        {special && car.status === 'owned' && (
          <View style={[styles.badge, { backgroundColor: colors.gold }]}>
            <Text style={[styles.badgeText, { color: colors.bg }]}>{special.replace('Super Treasure Hunt', 'STH')}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {car.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[car.brand, car.year].filter(Boolean).join(' · ') || ' '}
        </Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value ? formatMoney(value, car.currency) : '—'}</Text>
          {g && g.amount !== 0 && (
            <Ionicons name={g.amount > 0 ? 'caret-up' : 'caret-down'} size={12} color={g.amount > 0 ? colors.up : colors.down} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceAlt },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  body: { padding: space.md, gap: 2 },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  value: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '800' },
});
