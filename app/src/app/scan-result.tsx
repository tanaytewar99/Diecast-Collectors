import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarPhoto } from '../components/CarCard';
import { MarketCard } from '../components/MarketCard';
import { Button, Card, Chip, Label, MoneyInput } from '../components/ui';
import { identify, valuate } from '../lib/api';
import { CONDITION_LABEL, PACKAGING_LABEL, parseAmount } from '../lib/format';
import { deletePhoto } from '../lib/photos';
import { emptyDetails, useStore } from '../lib/store';
import { colors, font, radius, space } from '../lib/theme';
import type { CarDetails, IdentifyResponse } from '../lib/types';
import { toMarketValue } from '../lib/value';

const STEPS = ['Identifying car', 'Looking up details', 'Checking market prices'];

export default function ScanResult() {
  const insets = useSafeAreaInsets();
  const draft = useStore((s) => s.draft);
  const currency = useStore((s) => s.settings.currency);
  const { updateDraft, saveDraft, setDraft } = useStore.getState();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [revaluing, setRevaluing] = useState(false);
  const [myValue, setMyValue] = useState('');
  const [purchase, setPurchase] = useState('');
  const started = useRef(false);

  const run = async () => {
    const image = useStore.getState().draft?.pendingImage;
    if (!image) return;
    setError(null);
    setStep(0);
    const timers = [setTimeout(() => setStep(1), 6000), setTimeout(() => setStep(2), 14000)];
    try {
      const result: IdentifyResponse = await identify(image, 'image/jpeg');
      const { identification } = result;
      updateDraft({
        result,
        pendingImage: null,
        details: identification.car,
        description: identification.description,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      timers.forEach(clearTimeout);
    }
  };

  useEffect(() => {
    if (!started.current && draft?.pendingImage && !draft.result) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start identification once per draft
  }, [draft]);

  const revalue = async (details: CarDetails) => {
    setRevaluing(true);
    try {
      const v = await valuate(details, currency);
      const current = useStore.getState().draft;
      if (current?.result) updateDraft({ result: { ...current.result, valuation: v, valuationError: null } });
    } catch (e) {
      const current = useStore.getState().draft;
      if (current?.result)
        updateDraft({
          result: { ...current.result, valuation: null, valuationError: e instanceof Error ? e.message : 'Value unavailable.' },
        });
    } finally {
      setRevaluing(false);
    }
  };

  // Re-value whenever the identity changes after the scan (alternative picked, details edited).
  const d0 = draft?.details;
  const identityKey = d0
    ? JSON.stringify([d0.name, d0.brand, d0.series, d0.year, d0.color, d0.packaging, d0.condition, d0.flags])
    : null;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!identityKey || !draft?.result?.identification.isDiecast) return;
    if (lastKey.current === null) {
      lastKey.current = identityKey;
      return;
    }
    if (identityKey !== lastKey.current) {
      lastKey.current = identityKey;
      revalue(draft.details);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to identity changes
  }, [identityKey]);

  if (!draft) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Button title="Back to Garage" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const retake = () => {
    deletePhoto(draft.photoUri);
    setDraft(null);
    router.replace('/scan');
  };

  const addManually = () => {
    updateDraft({ pendingImage: null, result: null, details: emptyDetails() });
    router.push('/car/edit?draft=1');
  };

  // ---- Identifying ----
  if (!draft.result && !error) {
    return (
      <View style={[styles.screen, styles.center, { gap: space.xl, padding: space.xl }]}>
        <CarPhoto uri={draft.photoUri} style={styles.loadingPhoto} />
        <ActivityIndicator size="large" color={colors.primary} />
        <View style={{ gap: space.sm, alignSelf: 'stretch' }}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepRow}>
              <Ionicons
                name={i < step ? 'checkmark-circle' : i === step ? 'ellipse' : 'ellipse-outline'}
                size={18}
                color={i < step ? colors.up : i === step ? colors.primary : colors.border}
              />
              <Text style={[styles.stepText, i === step && { color: colors.text }]}>{s}…</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ---- Failed ----
  if (error || !draft.result) {
    return (
      <View style={[styles.screen, styles.center, { gap: space.lg, padding: space.xl }]}>
        <Ionicons name="warning" size={44} color={colors.gold} />
        <Text style={[font.h2, { color: colors.text, textAlign: 'center' }]}>{"Couldn't identify this one"}</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{error}</Text>
        <Button title="Try again" icon="refresh" onPress={run} style={{ alignSelf: 'stretch' }} />
        <Button title="Add manually" variant="ghost" icon="create" onPress={addManually} style={{ alignSelf: 'stretch' }} />
        <Button title="Retake photo" variant="ghost" icon="camera" onPress={retake} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  const { identification, valuation, valuationError } = draft.result;
  const d = draft.details;

  // ---- Not a diecast ----
  if (!identification.isDiecast) {
    return (
      <View style={[styles.screen, styles.center, { gap: space.lg, padding: space.xl }]}>
        <CarPhoto uri={draft.photoUri} style={styles.loadingPhoto} />
        <Text style={[font.h2, { color: colors.text, textAlign: 'center' }]}>No diecast car found</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
          Try a closer shot with the car (or its card) filling the frame and good light.
        </Text>
        <Button title="Retake photo" icon="camera" onPress={retake} style={{ alignSelf: 'stretch' }} />
        <Button title="Add manually" variant="ghost" icon="create" onPress={addManually} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  const pickAlternative = (i: number) => {
    const alt = identification.alternatives[i];
    const swapped: CarDetails = {
      ...d,
      name: alt.name,
      brand: alt.brand ?? d.brand,
      series: alt.series,
      year: alt.year,
      color: alt.color ?? d.color,
      castingNumber: null,
    };
    // The old primary match becomes an alternative, so the user can swap back.
    const alternatives = identification.alternatives.map((a, j) =>
      j === i ? { name: d.name, brand: d.brand, series: d.series, year: d.year, color: d.color } : a,
    );
    updateDraft({
      details: swapped,
      description: null,
      result: { ...draft.result!, identification: { ...identification, alternatives }, valuation: null },
    });
  };

  const save = () => {
    updateDraft({ myValue: parseAmount(myValue), purchasePrice: parseAmount(purchase) });
    const id = saveDraft();
    if (id) router.replace(`/car/${id}`);
  };

  const lowConfidence = identification.confidence < 0.5;
  const market = valuation ? toMarketValue(valuation) : null;
  const facts: [string, string | null][] = [
    ['Brand', d.brand],
    ['Series', d.series],
    ['Year', d.year ? String(d.year) : null],
    ['Scale', d.scale],
    ['Colour', d.color],
    ['Toy #', d.castingNumber],
    ['Packaging', d.packaging !== 'unknown' ? PACKAGING_LABEL[d.packaging] : null],
    ['Condition', d.condition !== 'unknown' ? CONDITION_LABEL[d.condition] : null],
  ];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 140 }} keyboardShouldPersistTaps="handled">
        <View>
          <CarPhoto uri={draft.photoUri} style={styles.photo} />
          <View style={styles.confidence}>
            <Ionicons name="sparkles" size={12} color={colors.gold} />
            <Text style={styles.confidenceText}>{Math.round(identification.confidence * 100)}% match</Text>
          </View>
        </View>

        {lowConfidence && (
          <View style={styles.warn}>
            <Ionicons name="help-circle" size={18} color={colors.gold} />
            <Text style={styles.warnText}>Not sure about this one. Check the details or pick an alternative below.</Text>
          </View>
        )}

        <View style={{ gap: space.sm }}>
          <Text style={[font.title, { color: colors.text }]}>{d.name}</Text>
          {(d.make || d.model) && <Text style={{ color: colors.textMuted }}>{[d.make, d.model].filter(Boolean).join(' ')}</Text>}
          {d.flags.length > 0 && (
            <View style={styles.chips}>
              {d.flags.map((f) => (
                <Chip key={f} label={f} tone="gold" />
              ))}
            </View>
          )}
          {draft.description && <Text style={styles.desc}>{draft.description}</Text>}
        </View>

        <Card>
          <View style={styles.facts}>
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <View key={k} style={styles.fact}>
                  <Label>{k}</Label>
                  <Text style={styles.factValue}>{v}</Text>
                </View>
              ))}
          </View>
        </Card>

        <MarketCard
          market={market}
          currency={currency}
          loading={revaluing}
          error={valuationError}
          onRefresh={() => revalue(d)}
        />

        <Card>
          <Label>Your numbers (optional)</Label>
          <View style={styles.inputs}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.inputLabel}>My value</Text>
              <MoneyInput value={myValue} onChangeText={setMyValue} currency={currency} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.inputLabel}>Purchase price</Text>
              <MoneyInput value={purchase} onChangeText={setPurchase} currency={currency} />
            </View>
          </View>
          <Text style={styles.help}>
            {"My value is your own valuation. It's the headline value in your garage whenever it's set."}
          </Text>
        </Card>

        <View style={styles.segment}>
          {(['owned', 'wishlist'] as const).map((s) => (
            <Pressable key={s} onPress={() => updateDraft({ status: s })} style={[styles.segmentItem, draft.status === s && styles.segmentActive]}>
              <Ionicons name={s === 'owned' ? 'car-sport' : 'heart'} size={16} color={draft.status === s ? colors.text : colors.textDim} />
              <Text style={[styles.segmentText, draft.status === s && { color: colors.text }]}>
                {s === 'owned' ? 'In my Garage' : 'Wishlist'}
              </Text>
            </Pressable>
          ))}
        </View>

        {identification.alternatives.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Label>Not quite? Other possible matches</Label>
            {identification.alternatives.map((a, i) => (
              <Pressable key={`${a.name}-${i}`} onPress={() => pickAlternative(i)} style={styles.alt}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.altName}>{a.name}</Text>
                  <Text style={styles.altMeta}>{[a.brand, a.series, a.year, a.color].filter(Boolean).join(' · ')}</Text>
                </View>
                <Ionicons name="swap-horizontal" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title={draft.status === 'owned' ? 'Add to Garage' : 'Add to Wishlist'} icon="add-circle" onPress={save} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            title="Edit details"
            variant="ghost"
            icon="create-outline"
            onPress={() => {
              updateDraft({ myValue: parseAmount(myValue), purchasePrice: parseAmount(purchase) });
              router.push('/car/edit?draft=1');
            }}
            style={{ flex: 1 }}
          />
          <Button title="Retake" variant="ghost" icon="camera-outline" onPress={retake} style={{ flex: 1 }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingPhoto: { width: 220, height: 165, borderRadius: radius.lg },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center' },
  stepText: { color: colors.textDim, fontSize: 15, fontWeight: '600', width: 200 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl, backgroundColor: colors.surface },
  confidence: {
    position: 'absolute',
    right: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  confidenceText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  warn: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: 'rgba(245,180,0,0.12)',
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  warnText: { color: colors.text, flex: 1, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  desc: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  fact: { width: '50%', gap: 2, paddingRight: space.sm },
  factValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  inputs: { flexDirection: 'row', gap: space.md },
  inputLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  help: { color: colors.textDim, fontSize: 12 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textDim, fontWeight: '700' },
  alt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.md,
  },
  altName: { color: colors.text, fontWeight: '700' },
  altMeta: { color: colors.textDim, fontSize: 12 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
});
