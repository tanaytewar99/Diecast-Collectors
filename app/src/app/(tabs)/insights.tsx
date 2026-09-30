import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ValueChart } from '../../components/ValueChart';
import { Button, Card, EmptyState, Label } from '../../components/ui';
import { formatMoney, formatPercent } from '../../lib/format';
import { refreshCar } from '../../lib/refresh';
import { useStore } from '../../lib/store';
import { colors, font, space } from '../../lib/theme';
import type { Car } from '../../lib/types';
import { collectionSeries, effectiveValue, gain, totals } from '../../lib/value';

export default function Insights() {
  const insets = useSafeAreaInsets();
  const cars = useStore((s) => s.cars);
  const currency = useStore((s) => s.settings.currency);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const owned = useMemo(() => cars.filter((c) => c.status === 'owned'), [cars]);
  const t = useMemo(() => totals(cars), [cars]);
  const series = useMemo(() => collectionSeries(cars), [cars]);
  const money = (n: number) => formatMoney(n, currency);

  const top = useMemo(() => [...owned].sort((a, b) => effectiveValue(b) - effectiveValue(a)).slice(0, 5), [owned]);
  const movers = useMemo(
    () =>
      owned
        .map((c) => ({ car: c, g: gain(c) }))
        .filter((x): x is { car: Car; g: NonNullable<ReturnType<typeof gain>> } => !!x.g && x.g.amount !== 0)
        .sort((a, b) => b.g.amount - a.g.amount),
    [owned],
  );
  const brands = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const c of owned) {
      const key = c.brand ?? 'Other';
      const e = map.get(key) ?? { count: 0, value: 0 };
      map.set(key, { count: e.count + 1, value: e.value + effectiveValue(c) });
    }
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [owned]);
  const maxBrand = Math.max(1, ...brands.map(([, v]) => v.value));

  const refreshAll = async () => {
    const run = async () => {
      const list = [...owned];
      setProgress({ done: 0, total: list.length });
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        try {
          await refreshCar(list[i].id);
        } catch {
          failed++;
        }
        setProgress({ done: i + 1, total: list.length });
      }
      setProgress(null);
      if (failed) Alert.alert('Refresh finished', `${failed} car${failed > 1 ? 's' : ''} couldn't be valued right now.`);
    };
    if (owned.length > 20) {
      const msg = `This checks prices for ${owned.length} cars and may take a while.`;
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) run();
      } else {
        Alert.alert('Refresh all values?', msg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Refresh', onPress: run },
        ]);
      }
    } else run();
  };

  if (owned.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center' }]}>
        <EmptyState icon="stats-chart" title="No insights yet" body="Add cars to your garage to see how your collection's value moves." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, gap: space.lg, paddingBottom: 120 }}>
      <Text style={[font.title, { color: colors.text }]}>Insights</Text>

      <Card>
        <Label>Collection value</Label>
        <Text style={[font.hero, { color: colors.text }]}>{money(t.collectionValue)}</Text>
        <ValueChart series={[{ label: 'Collection', color: colors.chartMarket, points: series }]} format={(n) => formatMoney(n, currency, { compact: true })} />
      </Card>

      <View style={styles.grid}>
        <Tile label="Cars owned" value={String(t.owned)} />
        <Tile label="Wishlist" value={String(t.wishlist)} />
        <Tile label="Invested" value={money(t.invested)} />
        <Tile label="Market value" value={money(t.marketValue)} />
        <Tile label="My valuations" value={money(t.myValue)} />
        <Tile
          label="Unrealised gain"
          value={`${t.gain >= 0 ? '+' : '−'}${money(Math.abs(t.gain))}`}
          color={t.gain > 0 ? colors.up : t.gain < 0 ? colors.down : undefined}
        />
      </View>

      <Button
        title={progress ? `Refreshing ${progress.done}/${progress.total}…` : 'Refresh all market values'}
        variant="secondary"
        icon="refresh"
        loading={false}
        disabled={!!progress}
        onPress={refreshAll}
      />

      <Card>
        <Label>Most valuable</Label>
        {top.map((c, i) => (
          <CarRow key={c.id} rank={i + 1} car={c} right={money(effectiveValue(c))} />
        ))}
      </Card>

      {movers.length > 0 && (
        <Card>
          <Label>Gain vs. what you paid</Label>
          {[...movers.slice(0, 3), ...movers.slice(3).slice(-3)].map(({ car, g }) => (
            <CarRow
              key={car.id}
              car={car}
              right={`${g.amount >= 0 ? '+' : '−'}${money(Math.abs(g.amount))}`}
              sub={formatPercent(g.pct)}
              rightColor={g.amount >= 0 ? colors.up : colors.down}
            />
          ))}
        </Card>
      )}

      <Card>
        <Label>By brand</Label>
        {brands.map(([brand, v]) => (
          <View key={brand} style={{ gap: 6, paddingVertical: 6 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.rowName}>
                {brand} <Text style={styles.rowSub}>· {v.count}</Text>
              </Text>
              <Text style={styles.rowValue}>{money(v.value)}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: `${Math.max(2, (v.value / maxBrand) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, color && { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function CarRow({ car, right, sub, rank, rightColor }: { car: Car; right: string; sub?: string; rank?: number; rightColor?: string }) {
  return (
    <Pressable onPress={() => router.push(`/car/${car.id}`)} style={styles.carRow}>
      {rank !== undefined && <Text style={styles.rank}>{rank}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {car.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[car.brand, car.year].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowValue, rightColor && { color: rightColor }]}>{right}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48.5%', backgroundColor: colors.surface, borderRadius: 14, padding: space.md, gap: 2 },
  tileValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  tileLabel: { color: colors.textDim, fontSize: 12 },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8 },
  rank: { color: colors.textDim, fontWeight: '800', width: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  rowName: { color: colors.text, fontWeight: '600', fontSize: 14 },
  rowSub: { color: colors.textDim, fontSize: 12, fontWeight: '400' },
  rowValue: { color: colors.text, fontWeight: '700', fontSize: 14 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bg },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.chartMarket },
});
