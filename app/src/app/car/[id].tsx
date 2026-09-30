import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CarPhoto } from '../../components/CarCard';
import { MarketCard } from '../../components/MarketCard';
import { ValueChart } from '../../components/ValueChart';
import { Button, Card, Chip, Delta, Label, MoneyInput } from '../../components/ui';
import { CONDITION_LABEL, formatMoney, PACKAGING_LABEL, parseAmount } from '../../lib/format';
import { deletePhoto } from '../../lib/photos';
import { refreshCar } from '../../lib/refresh';
import { useCar, useStore } from '../../lib/store';
import { colors, font, radius, space } from '../../lib/theme';
import { effectiveValue, gain } from '../../lib/value';

export default function CarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const car = useCar(id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'myValue' | 'purchasePrice' | null>(null);
  const [input, setInput] = useState('');
  const autoTried = useRef(false);

  const refresh = async () => {
    if (!car) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshCar(car.id);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Value unavailable.');
    } finally {
      setRefreshing(false);
    }
  };

  // Cars added manually (or whose first valuation failed) get one automatic attempt.
  useEffect(() => {
    if (car && !car.market && !autoTried.current) {
      autoTried.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one attempt per car
  }, [car?.id]);

  if (!car) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>This car is no longer in your garage.</Text>
      </View>
    );
  }

  const money = (n: number | null) => formatMoney(n, car.currency);
  const g = gain(car);

  const startEdit = (field: 'myValue' | 'purchasePrice') => {
    setInput(car[field] !== null ? String(car[field]) : '');
    setEditing(field);
  };
  const commitEdit = () => {
    if (!editing) return;
    const value = parseAmount(input);
    if (editing === 'myValue') useStore.getState().setMyValue(car.id, value);
    else useStore.getState().updateCar(car.id, { purchasePrice: value });
    setEditing(null);
  };

  const confirmDelete = () => {
    const doDelete = () => {
      deletePhoto(car.photoUri);
      useStore.getState().deleteCar(car.id);
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${car.name}?`)) doDelete();
      return;
    }
    Alert.alert('Delete car', `Remove ${car.name} from your collection?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const toggleStatus = () =>
    useStore.getState().updateCar(car.id, { status: car.status === 'owned' ? 'wishlist' : 'owned' });

  const details: [string, string | null][] = [
    ['Brand', car.brand],
    ['Series', car.series],
    ['Release year', car.year ? String(car.year) : null],
    ['Real car', [car.make, car.model].filter(Boolean).join(' ') || null],
    ['Scale', car.scale],
    ['Colour', car.color],
    ['Toy / casting #', car.castingNumber],
    ['Packaging', PACKAGING_LABEL[car.packaging]],
    ['Condition', CONDITION_LABEL[car.condition]],
  ];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: space.lg, paddingRight: space.md }}>
              <Pressable onPress={() => router.push(`/car/edit?id=${car.id}`)} hitSlop={10} accessibilityLabel="Edit details">
                <Ionicons name="create-outline" size={22} color={colors.text} />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Delete">
                <Ionicons name="trash-outline" size={22} color={colors.down} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <CarPhoto uri={car.photoUri} style={styles.photo} />

        <View style={{ gap: space.xs }}>
          <Text style={[font.title, { color: colors.text }]}>{car.name}</Text>
          <Text style={{ color: colors.textMuted }}>{[car.brand, car.series, car.year].filter(Boolean).join(' · ')}</Text>
          <View style={styles.chips}>
            <Chip
              label={car.status === 'owned' ? 'In my Garage' : 'Wishlist'}
              tone={car.status === 'owned' ? 'default' : 'red'}
              onPress={toggleStatus}
            />
            {car.flags.map((f) => (
              <Chip key={f} label={f} tone="gold" />
            ))}
          </View>
        </View>

        {/* Value panel */}
        <Card style={{ gap: space.md }}>
          <Label>{car.myValue !== null ? 'My value' : 'Value'}</Label>
          <Text style={styles.headline}>{money(effectiveValue(car) || null)}</Text>
          {g && <Delta amount={g.amount} pct={g.pct} format={(n) => money(n)} />}

          <View style={styles.valueGrid}>
            <ValueCell
              label="My value"
              value={car.myValue !== null ? money(car.myValue) : 'Set'}
              accent={car.myValue === null}
              onPress={() => startEdit('myValue')}
            />
            <ValueCell label="Market" value={car.market ? money(car.market.estimate) : '—'} />
            <ValueCell
              label="Paid"
              value={car.purchasePrice !== null ? money(car.purchasePrice) : 'Set'}
              accent={car.purchasePrice === null}
              onPress={() => startEdit('purchasePrice')}
            />
          </View>

          {editing && (
            <View style={{ gap: space.sm }}>
              <Text style={styles.inputLabel}>{editing === 'myValue' ? 'Your valuation' : 'What you paid'}</Text>
              <MoneyInput value={input} onChangeText={setInput} currency={car.currency} autoFocus onSubmit={commitEdit} />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button title="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                <Button title="Save" onPress={commitEdit} style={{ flex: 1 }} />
              </View>
            </View>
          )}

          <ValueChart
            format={(n) => formatMoney(n, car.currency, { compact: true })}
            series={[
              {
                label: 'Market',
                color: colors.chartMarket,
                points: car.valueHistory.map((p) => ({ date: p.date, value: p.estimate })),
              },
              {
                label: 'My value',
                color: colors.chartMine,
                dashed: true,
                points: car.myValueHistory.map((p) => ({ date: p.date, value: p.value })),
              },
            ]}
          />
        </Card>

        <MarketCard market={car.market} currency={car.currency} loading={refreshing} error={refreshError} onRefresh={refresh} />

        <Card>
          <Label>Details</Label>
          {details
            .filter(([, v]) => v && v !== 'Unknown')
            .map(([k, v]) => (
              <View key={k} style={styles.detailRow}>
                <Text style={styles.detailKey}>{k}</Text>
                <Text style={styles.detailValue}>{v}</Text>
              </View>
            ))}
          {car.description && <Text style={styles.desc}>{car.description}</Text>}
          {car.notes && (
            <View style={{ marginTop: space.sm, gap: 4 }}>
              <Label>Notes</Label>
              <Text style={styles.desc}>{car.notes}</Text>
            </View>
          )}
          <Button
            title="Edit details"
            variant="ghost"
            icon="create-outline"
            onPress={() => router.push(`/car/edit?id=${car.id}`)}
            style={{ marginTop: space.sm }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ValueCell({ label, value, onPress, accent }: { label: string; value: string; onPress?: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[styles.cellValue, accent && { color: colors.primary }]} numberOfLines={1}>
          {value}
        </Text>
        {onPress && <Ionicons name="pencil" size={11} color={colors.textDim} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  headline: { ...font.hero, color: colors.text },
  valueGrid: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md, gap: 2 },
  cellLabel: { color: colors.textDim, fontSize: 12 },
  cellValue: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  inputLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
    gap: space.lg,
  },
  detailKey: { color: colors.textDim, fontSize: 14 },
  detailValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  desc: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
