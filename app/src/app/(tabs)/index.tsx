import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarCard } from '../../components/CarCard';
import { Button, Chip, Delta, EmptyState } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { useStore } from '../../lib/store';
import { BRAND, colors, font, radius, space } from '../../lib/theme';
import type { Car } from '../../lib/types';
import { effectiveValue, gain, monthChange, totals } from '../../lib/value';

type Filter = 'all' | 'owned' | 'wishlist';
type Sort = 'recent' | 'value' | 'name' | 'gain';
const SORT_LABEL: Record<Sort, string> = { recent: 'Recent', value: 'Value', name: 'A–Z', gain: 'Gain' };

export default function Garage() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Fixed column width so a lone card in the last row doesn't stretch.
  const cardWidth = (width - space.lg * 2 - space.md) / 2;
  const cars = useStore((s) => s.cars);
  const currency = useStore((s) => s.settings.currency);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [brand, setBrand] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('recent');

  const t = useMemo(() => totals(cars), [cars]);
  const change = useMemo(() => monthChange(cars), [cars]);
  const brands = useMemo(
    () => [...new Set(cars.map((c) => c.brand).filter((b): b is string => !!b))].sort(),
    [cars],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = cars.filter(
      (c) =>
        (filter === 'all' || c.status === filter) &&
        (!brand || c.brand === brand) &&
        (!q ||
          [c.name, c.brand, c.series, c.make, c.model, c.color, c.castingNumber, String(c.year ?? '')]
            .filter(Boolean)
            .some((f) => f!.toLowerCase().includes(q))),
    );
    const cmp: Record<Sort, (a: Car, b: Car) => number> = {
      recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
      value: (a, b) => effectiveValue(b) - effectiveValue(a),
      name: (a, b) => a.name.localeCompare(b.name),
      gain: (a, b) => (gain(b)?.amount ?? -Infinity) - (gain(a)?.amount ?? -Infinity),
    };
    return [...list].sort(cmp[sort]);
  }, [cars, query, filter, brand, sort]);

  const money = (n: number) => formatMoney(n, currency);
  const nextSort = () => {
    const order: Sort[] = ['recent', 'value', 'name', 'gain'];
    setSort(order[(order.indexOf(sort) + 1) % order.length]);
  };

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <View style={styles.brandRow}>
        <View style={styles.logo}>
          <Ionicons name="car-sport" size={18} color={colors.text} />
        </View>
        <Text style={styles.brand}>{BRAND.name}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Collection value</Text>
        <Text style={styles.heroValue}>{money(t.collectionValue)}</Text>
        <View style={styles.heroRow}>
          {change && change.amount !== 0 ? (
            <Delta amount={change.amount} pct={change.pct} format={money} />
          ) : (
            <Text style={styles.heroMeta}>Tracking since your first car</Text>
          )}
          <Text style={styles.heroMeta}>{change && change.amount !== 0 ? '30 days' : ''}</Text>
        </View>
        <View style={styles.statRow}>
          <Stat label="Cars" value={String(t.owned)} />
          <Stat label="Invested" value={money(t.invested)} />
          <Stat label="Wishlist" value={String(t.wishlist)} />
        </View>
      </View>

      {cars.length > 0 && (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textDim} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, brand, series, year…"
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.textDim} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {(['all', 'owned', 'wishlist'] as Filter[]).map((f) => (
              <Chip
                key={f}
                label={f === 'all' ? 'All' : f === 'owned' ? 'Garage' : 'Wishlist'}
                active={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 2 }} />
            {brands.map((b) => (
              <Chip key={b} label={b} active={brand === b} onPress={() => setBrand(brand === b ? null : b)} />
            ))}
          </ScrollView>
          <View style={styles.listHeader}>
            <Text style={styles.count}>
              {visible.length} {visible.length === 1 ? 'car' : 'cars'}
            </Text>
            <Pressable onPress={nextSort} style={styles.sort} hitSlop={8}>
              <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
              <Text style={styles.sortText}>{SORT_LABEL[sort]}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <CarCard car={item} />
          </View>
        )}
        ListEmptyComponent={
          cars.length === 0 ? (
            <EmptyState
              icon="scan"
              title="Start your garage"
              body="Point your camera at a diecast car, loose or carded. We'll identify it, fill in the details and look up what it's worth."
              action={<Button title="Scan your first car" icon="camera" onPress={() => router.push('/scan')} />}
            />
          ) : (
            <EmptyState icon="search" title="No matches" body="Try a different search or filter." />
          )
        }
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.xs,
    borderTopWidth: 3,
    borderTopColor: colors.primary,
  },
  heroLabel: { ...font.label, color: colors.textDim },
  heroValue: { ...font.hero, color: colors.text },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroMeta: { color: colors.textDim, fontSize: 13 },
  statRow: { flexDirection: 'row', marginTop: space.lg, gap: space.md },
  statValue: { color: colors.text, fontSize: 17, fontWeight: '700' },
  statLabel: { color: colors.textDim, fontSize: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: colors.textDim, fontSize: 13 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
