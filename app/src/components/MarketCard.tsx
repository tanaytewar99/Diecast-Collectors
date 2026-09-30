import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney, relativeTime } from '../lib/format';
import { colors, space } from '../lib/theme';
import type { MarketValue } from '../lib/types';
import { Card, Label } from './ui';

const CONFIDENCE_COLOR = { low: colors.down, medium: colors.gold, high: colors.up } as const;

export function MarketCard({
  market,
  currency,
  loading,
  error,
  onRefresh,
}: {
  market: MarketValue | null;
  currency: string;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}) {
  const [showSources, setShowSources] = useState(false);

  return (
    <Card>
      <View style={styles.header}>
        <Label>Market value</Label>
        {onRefresh && (
          <Pressable onPress={onRefresh} disabled={loading} hitSlop={10} accessibilityLabel="Refresh market value" style={styles.refresh}>
            {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Ionicons name="refresh" size={18} color={colors.textMuted} />}
          </Pressable>
        )}
      </View>

      {market ? (
        <>
          <Text style={styles.estimate}>{formatMoney(market.estimate, currency)}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              Range {formatMoney(market.low, currency)} – {formatMoney(market.high, currency)}
            </Text>
            <View style={styles.dot} />
            <View style={[styles.conf, { borderColor: CONFIDENCE_COLOR[market.confidence] }]}>
              <Text style={[styles.confText, { color: CONFIDENCE_COLOR[market.confidence] }]}>{market.confidence} confidence</Text>
            </View>
          </View>
          <Text style={styles.rationale}>{market.rationale}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaDim}>Updated {relativeTime(market.checkedAt)}</Text>
            {market.sources.length > 0 && (
              <Pressable onPress={() => setShowSources((s) => !s)} hitSlop={8}>
                <Text style={styles.link}>
                  {showSources ? 'Hide' : `${market.sources.length} source${market.sources.length > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            )}
          </View>
          {showSources &&
            market.sources.map((s) => (
              <Pressable key={s.url} onPress={() => Linking.openURL(s.url)} style={styles.source}>
                <Ionicons name="open-outline" size={14} color={colors.textDim} />
                <Text style={styles.sourceText} numberOfLines={1}>
                  {s.title || s.url}
                </Text>
              </Pressable>
            ))}
        </>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.meta}>Checking recent sales and listings…</Text>
        </View>
      ) : (
        <Text style={styles.meta}>{error ?? 'Value unavailable.'} {onRefresh ? 'Tap ↻ to retry.' : ''}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refresh: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  estimate: { color: colors.gold, fontSize: 30, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  meta: { color: colors.textMuted, fontSize: 13 },
  metaDim: { color: colors.textDim, fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textDim },
  conf: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  confText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  rationale: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  sourceText: { color: colors.textMuted, fontSize: 13, flex: 1, textDecorationLine: 'underline' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
});
